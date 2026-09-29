import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileTypeFromBuffer } from 'file-type';
import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { findUserCard, skillsForUsers } from './userRepository.js';
import { getWalletSummary, grantBonus } from '../points/pointsService.js';
import { unreadCount as unreadNotifications } from '../notifications/notificationService.js';
import { matchWithUser } from '../matches/matchService.js';
import { audit } from '../admin/auditService.js';

const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

// ---------- profile completion ----------

export function computeProfileCompletion(card) {
  const checks = [
    { key: 'name', label: 'Add your full name', done: Boolean(card.fullName?.trim()) },
    { key: 'photo', label: 'Upload a profile photo', done: Boolean(card.avatarUrl) },
    { key: 'bio', label: 'Write a short bio', done: Boolean(card.bio?.trim()) },
    { key: 'location', label: 'Add your location', done: Boolean(card.location?.trim()) },
    { key: 'teaches', label: 'Add a skill you can teach', done: card.skills.teaches.length > 0 },
    { key: 'learns', label: 'Add a skill you want to learn', done: card.skills.wantsToLearn.length > 0 },
    { key: 'format', label: 'Choose a preferred learning format', done: Boolean(card.learningFormat) },
  ];
  const completed = checks.filter((c) => c.done).length;
  return {
    percent: Math.round((completed / checks.length) * 100),
    missing: checks.filter((c) => !c.done).map((c) => ({ key: c.key, label: c.label })),
  };
}

async function maybeGrantProfileBonus(userId) {
  const card = await findUserCard(userId);
  if (card && computeProfileCompletion(card).percent === 100) {
    await grantBonus(userId, 'PROFILE_COMPLETE');
  }
}

// ---------- current user ----------

export async function getMe(userId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
            p.bio, p.location, p.avatar_url, p.learning_format, p.is_public, p.show_points_publicly,
            p.notify_in_app, p.notify_email, p.onboarding_completed
     FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('User not found.');
  const [card, wallet, unreadNotificationCount, unreadMessages] = await Promise.all([
    findUserCard(userId),
    getWalletSummary(userId),
    unreadNotifications(userId),
    query('SELECT COUNT(*)::int AS count FROM messages WHERE receiver_id = $1 AND is_read = FALSE AND deleted_at IS NULL', [userId]),
  ]);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    profile: {
      bio: row.bio,
      location: row.location,
      avatarUrl: row.avatar_url,
      learningFormat: row.learning_format,
      isPublic: row.is_public,
      showPointsPublicly: row.show_points_publicly,
      notifyInApp: row.notify_in_app,
      notifyEmail: row.notify_email,
      onboardingCompleted: row.onboarding_completed,
    },
    skills: card.skills,
    rating: card.rating,
    reviewCount: card.reviewCount,
    completedExchanges: card.completedExchanges,
    teachingSessions: card.teachingSessions,
    completion: computeProfileCompletion(card),
    wallet,
    unreadNotifications: unreadNotificationCount,
    unreadMessages: unreadMessages.rows[0].count,
  };
}

// ---------- public profile ----------

export async function getPublicProfile(viewer, userId) {
  const card = await findUserCard(userId);
  if (!card) throw ApiError.notFound('User not found.');
  const isSelf = viewer?.id === userId;
  const isAdmin = viewer?.role === 'ADMIN';
  const { rows: privacy } = await query('SELECT is_public, show_points_publicly FROM profiles WHERE user_id = $1', [userId]);
  if (!isSelf && !isAdmin && (card.status !== 'ACTIVE' || !privacy[0]?.is_public)) {
    throw ApiError.notFound('This profile is not available.');
  }

  const [reviews, relation, match, wallet] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.id AS reviewer_id, u.full_name AS reviewer_name, p.avatar_url AS reviewer_avatar,
              s.name AS skill_name
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN profiles p ON p.user_id = u.id
       JOIN exchange_requests er ON er.id = r.exchange_request_id
       JOIN skills s ON s.id = er.skill_id
       WHERE r.reviewed_user_id = $1 AND r.status = 'VISIBLE'
       ORDER BY r.created_at DESC LIMIT 10`,
      [userId],
    ),
    viewer && !isSelf
      ? query(
          `SELECT id, status, sender_id, receiver_id, skill_id FROM exchange_requests
           WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
             AND status IN ('PENDING', 'ACCEPTED', 'COMPLETED')
           ORDER BY created_at DESC`,
          [viewer.id, userId],
        )
      : { rows: [] },
    viewer && !isSelf && viewer.role === 'USER' ? matchWithUser(viewer.id, userId) : null,
    privacy[0]?.show_points_publicly || isSelf ? getWalletSummary(userId) : null,
  ]);

  return {
    ...card,
    reviews: reviews.rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
      skillName: row.skill_name,
      reviewer: { id: row.reviewer_id, fullName: row.reviewer_name, avatarUrl: row.reviewer_avatar },
    })),
    match,
    canMessage: isSelf ? false : relation.rows.length > 0 || isAdmin,
    activeRequests: relation.rows.map((row) => ({
      id: row.id,
      status: row.status,
      skillId: row.skill_id,
      direction: row.sender_id === viewer?.id ? 'SENT' : 'RECEIVED',
    })),
    points: wallet ? { availableBalance: wallet.availableBalance, totalEarned: wallet.totalEarned } : null,
    isSelf,
  };
}

// ---------- profile updates ----------

export async function updateProfile(userId, data) {
  await withTransaction(async (client) => {
    if (data.fullName !== undefined) {
      await client.query('UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2', [data.fullName, userId]);
    }
    const fields = [];
    const values = [];
    const columnMap = {
      bio: 'bio',
      location: 'location',
      learningFormat: 'learning_format',
      isPublic: 'is_public',
      showPointsPublicly: 'show_points_publicly',
      notifyInApp: 'notify_in_app',
      notifyEmail: 'notify_email',
      onboardingCompleted: 'onboarding_completed',
    };
    for (const [key, column] of Object.entries(columnMap)) {
      if (data[key] !== undefined) {
        values.push(data[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }
    if (fields.length) {
      values.push(userId);
      await client.query(`UPDATE profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE user_id = $${values.length}`, values);
    }
  });
  await maybeGrantProfileBonus(userId);
  return getMe(userId);
}

// ---------- avatar ----------

async function removeAvatarFile(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) return;
  const filename = path.basename(avatarUrl);
  await fs.rm(path.join(env.uploadDir, 'avatars', filename), { force: true });
}

export async function updateAvatar(userId, file) {
  if (!file) throw ApiError.badRequest('Please choose an image to upload.');
  const detected = await fileTypeFromBuffer(file.buffer);
  const ext = detected ? ALLOWED_IMAGE_TYPES.get(detected.mime) : null;
  if (!ext) throw ApiError.badRequest('Only JPEG, PNG, WebP or GIF images are allowed.');

  const dir = path.join(env.uploadDir, 'avatars');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);

  const { rows } = await query('SELECT avatar_url FROM profiles WHERE user_id = $1', [userId]);
  const avatarUrl = `/uploads/avatars/${filename}`;
  await query('UPDATE profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2', [avatarUrl, userId]);
  await removeAvatarFile(rows[0]?.avatar_url);
  await maybeGrantProfileBonus(userId);
  return { avatarUrl };
}

export async function deleteAvatar(userId) {
  const { rows } = await query('SELECT avatar_url FROM profiles WHERE user_id = $1', [userId]);
  await query('UPDATE profiles SET avatar_url = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
  await removeAvatarFile(rows[0]?.avatar_url);
}

// ---------- user skills ----------

export async function listUserSkills(userId) {
  const map = await skillsForUsers([userId]);
  return map.get(userId);
}

export async function addUserSkill(userId, { skillId, type }) {
  const { rows } = await query("SELECT id, name FROM skills WHERE id = $1 AND status = 'ACTIVE'", [skillId]);
  if (!rows[0]) throw ApiError.notFound('Skill not found.');
  const opposite = type === 'TEACHES' ? 'WANTS_TO_LEARN' : 'TEACHES';
  const conflict = await query('SELECT 1 FROM user_skills WHERE user_id = $1 AND skill_id = $2 AND type = $3', [userId, skillId, opposite]);
  if (conflict.rows[0]) {
    throw ApiError.conflict(
      type === 'TEACHES'
        ? 'This skill is already in the list of skills you want to learn.'
        : 'This skill is already in the list of skills you teach.',
    );
  }
  const inserted = await query(
    `INSERT INTO user_skills (user_id, skill_id, type) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, skill_id, type) DO NOTHING RETURNING id`,
    [userId, skillId, type],
  );
  if (!inserted.rows[0]) throw ApiError.conflict('You already added this skill.');
  await maybeGrantProfileBonus(userId);
  return listUserSkills(userId);
}

export async function removeUserSkill(userId, skillId, type) {
  const params = [userId, skillId];
  let typeClause = '';
  if (type) {
    params.push(type);
    typeClause = ' AND type = $3';
  }
  const result = await query(`DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2${typeClause}`, params);
  if (!result.rowCount) throw ApiError.notFound('That skill is not on your profile.');
  return listUserSkills(userId);
}

// ---------- account deletion ----------

export async function deleteUser(actor, userId, { password } = {}) {
  const isSelf = actor.id === userId;
  if (!isSelf && actor.role !== 'ADMIN') throw ApiError.forbidden();
  const { rows } = await query('SELECT id, role, password_hash, email FROM users WHERE id = $1', [userId]);
  const target = rows[0];
  if (!target) throw ApiError.notFound('User not found.');
  if (target.role === 'ADMIN' && !isSelf) throw ApiError.forbidden('Administrator accounts cannot be deleted here.');

  if (isSelf) {
    if (!password || !(await bcrypt.compare(password, target.password_hash))) {
      throw ApiError.badRequest('Your password is incorrect.', { fields: { password: 'Incorrect password.' } });
    }
  }

  const reserved = await query(
    "SELECT COUNT(*)::int AS count FROM session_payments WHERE (learner_id = $1 OR teacher_id = $1) AND status IN ('RESERVED', 'DISPUTED')",
    [userId],
  );
  if (reserved.rows[0].count > 0) {
    throw ApiError.conflict('This account has active exchanges with reserved points. Cancel or complete them first.');
  }

  const { rows: avatar } = await query('SELECT avatar_url FROM profiles WHERE user_id = $1', [userId]);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    if (!isSelf) {
      await audit(actor.id, 'USER_DELETED', 'USER', userId, { email: target.email }, client);
    }
  });
  await removeAvatarFile(avatar[0]?.avatar_url);
}
