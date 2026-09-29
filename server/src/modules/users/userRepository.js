import { query } from '../../db/pool.js';

export const USER_CARD_SELECT = `
  u.id, u.full_name, u.role, u.status, u.created_at,
  p.bio, p.location, p.avatar_url, p.learning_format, p.is_public, p.onboarding_completed,
  (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.reviewed_user_id = u.id AND r.status = 'VISIBLE') AS rating,
  (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewed_user_id = u.id AND r.status = 'VISIBLE') AS review_count,
  (SELECT COUNT(*)::int FROM exchange_requests er WHERE er.status = 'COMPLETED' AND (er.sender_id = u.id OR er.receiver_id = u.id)) AS completed_exchanges,
  (SELECT COUNT(*)::int FROM sessions s WHERE s.status = 'COMPLETED' AND s.host_id = u.id) AS teaching_sessions
`;

/** Fetch teaching / learning skills for a set of user ids in one query. */
export async function skillsForUsers(userIds) {
  if (!userIds.length) return new Map();
  const { rows } = await query(
    `SELECT us.user_id, us.type, s.id, s.name, s.status, c.id AS category_id, c.name AS category_name
     FROM user_skills us
     JOIN skills s ON s.id = us.skill_id
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE us.user_id = ANY($1::int[])
     ORDER BY s.name`,
    [userIds],
  );
  const map = new Map();
  for (const id of userIds) map.set(id, { teaches: [], wantsToLearn: [] });
  for (const row of rows) {
    const entry = map.get(row.user_id);
    const skill = {
      id: row.id,
      name: row.name,
      status: row.status,
      category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
    };
    if (row.type === 'TEACHES') entry.teaches.push(skill);
    else entry.wantsToLearn.push(skill);
  }
  return map;
}

export function mapUserCard(row, skills) {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    bio: row.bio,
    location: row.location,
    avatarUrl: row.avatar_url,
    learningFormat: row.learning_format,
    rating: row.rating !== null ? Number(row.rating) : null,
    reviewCount: row.review_count,
    completedExchanges: row.completed_exchanges,
    teachingSessions: row.teaching_sessions,
    memberSince: row.created_at,
    skills: skills ?? { teaches: [], wantsToLearn: [] },
  };
}

export async function findUserCard(userId) {
  const { rows } = await query(
    `SELECT ${USER_CARD_SELECT} FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  if (!rows[0]) return null;
  const skills = await skillsForUsers([userId]);
  return mapUserCard(rows[0], skills.get(userId));
}
