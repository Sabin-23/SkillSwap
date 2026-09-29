import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { sendPasswordResetEmail } from '../../utils/mailer.js';
import { ensureWallet, grantBonus } from '../points/pointsService.js';
import { notify } from '../notifications/notificationService.js';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function register({ fullName, email, password }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) throw ApiError.conflict('Email already exists.');

  const passwordHash = await hashPassword(password);
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, full_name, email, role, status, created_at`,
      [fullName, email, passwordHash],
    );
    const created = rows[0];
    await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [created.id]);
    await ensureWallet(created.id, client);
    await grantBonus(created.id, 'WELCOME', client);
    await notify(
      created.id,
      {
        type: 'WELCOME',
        title: 'Welcome to SkillSwap',
        message: 'Complete your profile and add the skills you can teach to start finding partners.',
        link: '/app/onboarding',
      },
      client,
    );
    return created;
  });
  return publicUser(user);
}

export async function login({ email, password }) {
  const { rows } = await query(
    'SELECT id, full_name, email, role, status, password_hash, created_at FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !valid) throw ApiError.unauthorized('Invalid login credentials.');
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Your account has been suspended. Please contact support.');
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  return publicUser(user);
}

/**
 * Create a password reset token. Always resolves, even for unknown emails,
 * so the endpoint cannot be used to discover registered addresses.
 */
export async function requestPasswordReset(email) {
  const { rows } = await query('SELECT id, email FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return { resetUrl: null };

  const token = crypto.randomBytes(32).toString('hex');
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS)],
  );
  const resetUrl = `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, resetUrl);
  return { resetUrl };
}

export async function resetPassword({ token, password }) {
  const { rows } = await query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)],
  );
  const record = rows[0];
  if (!record) throw ApiError.badRequest('This reset link is invalid or has expired.');

  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      record.user_id,
    ]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id]);
  });
}

export async function changePassword(userId, { currentPassword, password }) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw ApiError.notFound('User not found.');
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect.', { fields: { currentPassword: 'Incorrect password.' } });
  const passwordHash = await hashPassword(password);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
}
