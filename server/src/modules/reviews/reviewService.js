import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { audit } from '../admin/auditService.js';

const REVIEW_SELECT = `
  r.id, r.exchange_request_id, r.rating, r.comment, r.status, r.created_at, r.updated_at,
  r.reviewer_id, ru.full_name AS reviewer_name, rp.avatar_url AS reviewer_avatar,
  r.reviewed_user_id, tu.full_name AS reviewed_name, tp.avatar_url AS reviewed_avatar,
  sk.name AS skill_name`;

const REVIEW_FROM = `
  FROM reviews r
  JOIN users ru ON ru.id = r.reviewer_id
  JOIN profiles rp ON rp.user_id = ru.id
  JOIN users tu ON tu.id = r.reviewed_user_id
  JOIN profiles tp ON tp.user_id = tu.id
  JOIN exchange_requests er ON er.id = r.exchange_request_id
  JOIN skills sk ON sk.id = er.skill_id`;

function mapReview(row) {
  return {
    id: row.id,
    exchangeRequestId: row.exchange_request_id,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    skillName: row.skill_name,
    reviewer: { id: row.reviewer_id, fullName: row.reviewer_name, avatarUrl: row.reviewer_avatar },
    reviewedUser: { id: row.reviewed_user_id, fullName: row.reviewed_name, avatarUrl: row.reviewed_avatar },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getReview(id) {
  const { rows } = await query(`SELECT ${REVIEW_SELECT} ${REVIEW_FROM} WHERE r.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Review not found.');
  return mapReview(rows[0]);
}

export async function listReviewsForUser(userId, params) {
  const pagination = parsePagination(params, { limit: 10 });
  const [{ rows }, count, stats] = await Promise.all([
    query(
      `SELECT ${REVIEW_SELECT} ${REVIEW_FROM} WHERE r.reviewed_user_id = $1 AND r.status = 'VISIBLE'
       ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pagination.limit, pagination.offset],
    ),
    query("SELECT COUNT(*)::int AS total FROM reviews WHERE reviewed_user_id = $1 AND status = 'VISIBLE'", [userId]),
    query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS average,
              COUNT(*) FILTER (WHERE rating = 5)::int AS five,
              COUNT(*) FILTER (WHERE rating = 4)::int AS four,
              COUNT(*) FILTER (WHERE rating = 3)::int AS three,
              COUNT(*) FILTER (WHERE rating = 2)::int AS two,
              COUNT(*) FILTER (WHERE rating = 1)::int AS one
       FROM reviews WHERE reviewed_user_id = $1 AND status = 'VISIBLE'`,
      [userId],
    ),
  ]);
  const s = stats.rows[0];
  return {
    ...paginatedResult(rows.map(mapReview), count.rows[0].total, pagination),
    summary: {
      average: s.average !== null ? Number(s.average) : null,
      total: count.rows[0].total,
      distribution: { 5: s.five, 4: s.four, 3: s.three, 2: s.two, 1: s.one },
    },
  };
}

export async function listReviewsByUser(userId, params) {
  const pagination = parsePagination(params, { limit: 10 });
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${REVIEW_SELECT} ${REVIEW_FROM} WHERE r.reviewer_id = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pagination.limit, pagination.offset],
    ),
    query('SELECT COUNT(*)::int AS total FROM reviews WHERE reviewer_id = $1', [userId]),
  ]);
  return paginatedResult(rows.map(mapReview), count.rows[0].total, pagination);
}

export async function createReview(user, { exchangeRequestId, rating, comment }) {
  const { rows } = await query(
    'SELECT id, sender_id, receiver_id, status FROM exchange_requests WHERE id = $1',
    [exchangeRequestId],
  );
  const request = rows[0];
  if (!request) throw ApiError.notFound('Exchange request not found.');
  if (request.sender_id !== user.id && request.receiver_id !== user.id) {
    throw ApiError.forbidden('You can only review exchanges you took part in.');
  }
  if (request.status !== 'COMPLETED') {
    throw ApiError.conflict('You can review your partner once the exchange is completed.');
  }
  const reviewedUserId = request.sender_id === user.id ? request.receiver_id : request.sender_id;

  const existing = await query('SELECT id FROM reviews WHERE exchange_request_id = $1 AND reviewer_id = $2', [
    exchangeRequestId,
    user.id,
  ]);
  if (existing.rows[0]) throw ApiError.conflict('You already reviewed this exchange.');

  const reviewId = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO reviews (exchange_request_id, reviewer_id, reviewed_user_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [exchangeRequestId, user.id, reviewedUserId, rating, comment || null],
    );
    await notify(
      reviewedUserId,
      {
        type: 'REVIEW_RECEIVED',
        title: 'New review',
        message: `${user.full_name} left you a ${rating}-star review.`,
        link: '/app/reviews',
      },
      client,
    );
    return inserted.rows[0].id;
  });
  return getReview(reviewId);
}

export async function updateReview(user, id, data) {
  const { rows } = await query('SELECT reviewer_id, status FROM reviews WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Review not found.');
  if (rows[0].reviewer_id !== user.id) throw ApiError.forbidden('You can only edit your own reviews.');
  if (rows[0].status !== 'VISIBLE') throw ApiError.conflict('This review was removed and cannot be edited.');
  await query(
    `UPDATE reviews SET rating = COALESCE($1, rating), comment = COALESCE($2, comment), updated_at = NOW() WHERE id = $3`,
    [data.rating ?? null, data.comment ?? null, id],
  );
  return getReview(id);
}

export async function deleteReview(user, id) {
  const { rows } = await query('SELECT reviewer_id, reviewed_user_id FROM reviews WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Review not found.');
  if (rows[0].reviewer_id === user.id) {
    await query('DELETE FROM reviews WHERE id = $1', [id]);
    return { removed: true };
  }
  if (user.role === 'ADMIN') {
    await query("UPDATE reviews SET status = 'REMOVED', updated_at = NOW() WHERE id = $1", [id]);
    await audit(user.id, 'REVIEW_REMOVED', 'REVIEW', id, { reviewedUserId: rows[0].reviewed_user_id });
    return { removed: true, byAdmin: true };
  }
  throw ApiError.forbidden('You can only delete your own reviews.');
}

export async function adminListReviews(params) {
  const pagination = parsePagination(params, { limit: 20 });
  const conditions = [];
  const values = [];
  if (params.status) {
    values.push(params.status);
    conditions.push(`r.status = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    conditions.push(`(ru.full_name ILIKE $${values.length} OR tu.full_name ILIKE $${values.length} OR r.comment ILIKE $${values.length})`);
  }
  if (params.maxRating) {
    values.push(Number(params.maxRating));
    conditions.push(`r.rating <= $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${REVIEW_SELECT} ${REVIEW_FROM} ${where} ORDER BY r.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total ${REVIEW_FROM} ${where}`, values),
  ]);
  return paginatedResult(rows.map(mapReview), count.rows[0].total, pagination);
}

export async function adminRestoreReview(adminId, id) {
  const result = await query("UPDATE reviews SET status = 'VISIBLE', updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
  if (!result.rows[0]) throw ApiError.notFound('Review not found.');
  await audit(adminId, 'REVIEW_RESTORED', 'REVIEW', id);
  return getReview(id);
}
