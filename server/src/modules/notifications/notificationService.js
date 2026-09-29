import { query } from '../../db/pool.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { ApiError } from '../../utils/errors.js';

/**
 * Create a notification for a user. Accepts an optional client so callers can
 * write notifications inside the same transaction as the triggering change.
 */
export async function notify(userId, { type, title, message, link = null }, client) {
  const runner = client ?? { query };
  await runner.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, link],
  );
}

export async function listNotifications(userId, params) {
  const pagination = parsePagination(params, { limit: 20 });
  const unreadOnly = params.unread === 'true';
  const where = unreadOnly ? 'WHERE user_id = $1 AND is_read = FALSE' : 'WHERE user_id = $1';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications ${where}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM notifications ${where}`, [userId]),
  ]);
  return paginatedResult(rows.map(mapNotification), count.rows[0].total, pagination);
}

export async function unreadCount(userId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId],
  );
  return rows[0].count;
}

export async function markRead(userId, id) {
  const { rows } = await query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, message, link, is_read, created_at`,
    [id, userId],
  );
  if (!rows[0]) throw ApiError.notFound('Notification not found.');
  return mapNotification(rows[0]);
}

export async function markAllRead(userId) {
  const result = await query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [userId],
  );
  return { updated: result.rowCount };
}

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}
