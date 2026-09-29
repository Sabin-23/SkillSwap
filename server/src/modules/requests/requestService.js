import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { getRateForDuration, refundReservation, reserveForRequest } from '../points/pointsService.js';

const REQUEST_SELECT = `
  er.id, er.message, er.duration_minutes, er.point_cost, er.status, er.created_at, er.updated_at,
  er.sender_id, su.full_name AS sender_name, sp.avatar_url AS sender_avatar,
  er.receiver_id, ru.full_name AS receiver_name, rp.avatar_url AS receiver_avatar,
  sk.id AS skill_id, sk.name AS skill_name,
  pay.status AS payment_status,
  (SELECT row_to_json(x) FROM (
     SELECT s.id, s.scheduled_date, s.start_time, s.end_time, s.format, s.status, s.location, s.meeting_link
     FROM sessions s WHERE s.exchange_request_id = er.id
     ORDER BY CASE s.status WHEN 'SCHEDULED' THEN 0 WHEN 'COMPLETED' THEN 1 ELSE 2 END, s.created_at DESC
     LIMIT 1) x) AS session`;

const REQUEST_FROM = `
  FROM exchange_requests er
  JOIN users su ON su.id = er.sender_id
  JOIN profiles sp ON sp.user_id = su.id
  JOIN users ru ON ru.id = er.receiver_id
  JOIN profiles rp ON rp.user_id = ru.id
  JOIN skills sk ON sk.id = er.skill_id
  LEFT JOIN session_payments pay ON pay.exchange_request_id = er.id`;

export function mapRequest(row, viewerId, reviewsByRequest) {
  const session = row.session
    ? {
        id: row.session.id,
        scheduledDate: row.session.scheduled_date,
        startTime: row.session.start_time,
        endTime: row.session.end_time,
        format: row.session.format,
        status: row.session.status,
        location: row.session.location,
        meetingLink: row.session.meeting_link,
      }
    : null;
  const myReview = reviewsByRequest?.get(row.id) ?? null;
  return {
    id: row.id,
    sender: { id: row.sender_id, fullName: row.sender_name, avatarUrl: row.sender_avatar },
    receiver: { id: row.receiver_id, fullName: row.receiver_name, avatarUrl: row.receiver_avatar },
    skill: { id: row.skill_id, name: row.skill_name },
    message: row.message,
    durationMinutes: row.duration_minutes,
    pointCost: row.point_cost,
    status: row.status,
    paymentStatus: row.payment_status,
    session,
    direction: viewerId ? (row.sender_id === viewerId ? 'SENT' : 'RECEIVED') : null,
    role: viewerId ? (row.sender_id === viewerId ? 'LEARNER' : 'TEACHER') : null,
    myReview,
    canReview: row.status === 'COMPLETED' && viewerId != null && !myReview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function reviewsFor(viewerId, requestIds) {
  if (!viewerId || !requestIds.length) return new Map();
  const { rows } = await query(
    `SELECT id, exchange_request_id, rating, comment, status FROM reviews
     WHERE reviewer_id = $1 AND exchange_request_id = ANY($2::int[])`,
    [viewerId, requestIds],
  );
  return new Map(
    rows.map((row) => [row.exchange_request_id, { id: row.id, rating: row.rating, comment: row.comment, status: row.status }]),
  );
}

export async function getRequest(id, viewer) {
  const { rows } = await query(`SELECT ${REQUEST_SELECT} ${REQUEST_FROM} WHERE er.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Exchange request not found.');
  if (viewer && viewer.role !== 'ADMIN' && row.sender_id !== viewer.id && row.receiver_id !== viewer.id) {
    throw ApiError.forbidden('You are not part of this exchange request.');
  }
  const reviews = await reviewsFor(viewer?.id, [row.id]);
  return mapRequest(row, viewer?.id, reviews);
}

/**
 * box: 'sent' | 'received' | 'completed' | 'all'
 */
export async function listRequests(userId, box, params) {
  const pagination = parsePagination(params, { limit: 10 });
  const values = [userId];
  const conditions = [];
  if (box === 'sent') conditions.push('er.sender_id = $1', "er.status <> 'COMPLETED'");
  else if (box === 'received') conditions.push('er.receiver_id = $1', "er.status <> 'COMPLETED'");
  else if (box === 'completed') conditions.push('(er.sender_id = $1 OR er.receiver_id = $1)', "er.status = 'COMPLETED'");
  else conditions.push('(er.sender_id = $1 OR er.receiver_id = $1)');
  if (params.status) {
    values.push(params.status);
    conditions.push(`er.status = $${values.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${REQUEST_SELECT} ${REQUEST_FROM} ${where}
       ORDER BY CASE er.status WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END, er.updated_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM exchange_requests er ${where}`, values),
  ]);
  const reviews = await reviewsFor(userId, rows.map((row) => row.id));
  return paginatedResult(rows.map((row) => mapRequest(row, userId, reviews)), count.rows[0].total, pagination);
}

export async function requestCounts(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM exchange_requests WHERE receiver_id = $1 AND status = 'PENDING') AS pending_received,
       (SELECT COUNT(*)::int FROM exchange_requests WHERE sender_id = $1 AND status = 'PENDING') AS pending_sent,
       (SELECT COUNT(*)::int FROM exchange_requests WHERE (sender_id = $1 OR receiver_id = $1) AND status = 'ACCEPTED') AS accepted,
       (SELECT COUNT(*)::int FROM exchange_requests WHERE (sender_id = $1 OR receiver_id = $1) AND status = 'COMPLETED') AS completed`,
    [userId],
  );
  const row = rows[0];
  return { pendingReceived: row.pending_received, pendingSent: row.pending_sent, accepted: row.accepted, completed: row.completed };
}

/** Server-side quote so the client never decides the cost. */
export async function quoteRequest(senderId, { receiverId, skillId, durationMinutes }) {
  const rate = await getRateForDuration(durationMinutes);
  const [{ rows: wallet }, { rows: teacher }] = await Promise.all([
    query('SELECT available_balance FROM wallets WHERE user_id = $1', [senderId]),
    query(
      `SELECT u.full_name, s.name AS skill_name FROM users u
       JOIN user_skills us ON us.user_id = u.id AND us.type = 'TEACHES' AND us.skill_id = $2
       JOIN skills s ON s.id = us.skill_id
       WHERE u.id = $1 AND u.status = 'ACTIVE'`,
      [receiverId, skillId],
    ),
  ]);
  if (!teacher[0]) throw ApiError.badRequest('This user does not teach the selected skill.');
  const available = wallet[0]?.available_balance ?? 0;
  return {
    teacherName: teacher[0].full_name,
    skillName: teacher[0].skill_name,
    durationMinutes,
    pointCost: rate.pointCost,
    availableBalance: available,
    balanceAfter: available - rate.pointCost,
    sufficient: available >= rate.pointCost,
  };
}

export async function createRequest(sender, data) {
  if (data.receiverId === sender.id) throw ApiError.badRequest('You cannot send a request to yourself.');

  const receiver = await query('SELECT id, full_name, status FROM users WHERE id = $1', [data.receiverId]);
  if (!receiver.rows[0] || receiver.rows[0].status !== 'ACTIVE') throw ApiError.notFound('User not found.');

  const teaches = await query(
    `SELECT s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id
     WHERE us.user_id = $1 AND us.skill_id = $2 AND us.type = 'TEACHES' AND s.status = 'ACTIVE'`,
    [data.receiverId, data.skillId],
  );
  if (!teaches.rows[0]) throw ApiError.badRequest('This user does not teach the selected skill.');

  const duplicate = await query(
    `SELECT id FROM exchange_requests
     WHERE sender_id = $1 AND receiver_id = $2 AND skill_id = $3 AND status IN ('PENDING', 'ACCEPTED')`,
    [sender.id, data.receiverId, data.skillId],
  );
  if (duplicate.rows[0]) throw ApiError.conflict('You already have an active request with this user for this skill.');

  const rate = await getRateForDuration(data.durationMinutes);

  const requestId = await withTransaction(async (client) => {
    let inserted;
    try {
      inserted = await client.query(
        `INSERT INTO exchange_requests (sender_id, receiver_id, skill_id, message, duration_minutes, point_cost)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [sender.id, data.receiverId, data.skillId, data.message || null, data.durationMinutes, rate.pointCost],
      );
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('You already have an active request with this user for this skill.');
      throw err;
    }
    const id = inserted.rows[0].id;
    await reserveForRequest(client, {
      learnerId: sender.id,
      teacherId: data.receiverId,
      requestId: id,
      points: rate.pointCost,
      skillName: teaches.rows[0].name,
      teacherName: receiver.rows[0].full_name,
    });
    await notify(
      data.receiverId,
      {
        type: 'REQUEST_RECEIVED',
        title: 'New exchange request',
        message: `${sender.full_name} would like to learn ${teaches.rows[0].name} from you.`,
        link: '/app/requests?tab=received',
      },
      client,
    );
    return id;
  });
  return getRequest(requestId, sender);
}

async function loadForUpdate(client, id) {
  const { rows } = await client.query(
    `SELECT er.*, sk.name AS skill_name, su.full_name AS sender_name, ru.full_name AS receiver_name
     FROM exchange_requests er
     JOIN skills sk ON sk.id = er.skill_id
     JOIN users su ON su.id = er.sender_id
     JOIN users ru ON ru.id = er.receiver_id
     WHERE er.id = $1 FOR UPDATE OF er`,
    [id],
  );
  if (!rows[0]) throw ApiError.notFound('Exchange request not found.');
  return rows[0];
}

export async function acceptRequest(user, id) {
  await withTransaction(async (client) => {
    const request = await loadForUpdate(client, id);
    if (request.receiver_id !== user.id) throw ApiError.forbidden('Only the recipient can accept this request.');
    if (request.status !== 'PENDING') throw ApiError.conflict('Only pending requests can be accepted.');
    await client.query("UPDATE exchange_requests SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1", [id]);
    await notify(
      request.sender_id,
      {
        type: 'REQUEST_ACCEPTED',
        title: 'Request accepted',
        message: `${request.receiver_name} accepted your ${request.skill_name} request. You can now schedule a session.`,
        link: `/app/requests?tab=sent`,
      },
      client,
    );
  });
  return getRequest(id, user);
}

export async function rejectRequest(user, id) {
  await withTransaction(async (client) => {
    const request = await loadForUpdate(client, id);
    if (request.receiver_id !== user.id) throw ApiError.forbidden('Only the recipient can reject this request.');
    if (request.status !== 'PENDING') throw ApiError.conflict('Only pending requests can be rejected.');
    await client.query("UPDATE exchange_requests SET status = 'REJECTED', updated_at = NOW() WHERE id = $1", [id]);
    await refundReservation(client, id, `Refund – ${request.skill_name} request was declined`);
    await notify(
      request.sender_id,
      {
        type: 'REQUEST_REJECTED',
        title: 'Request declined',
        message: `${request.receiver_name} declined your ${request.skill_name} request. Your reserved points have been refunded.`,
        link: '/app/requests?tab=sent',
      },
      client,
    );
  });
  return getRequest(id, user);
}

export async function cancelRequest(user, id) {
  await withTransaction(async (client) => {
    const request = await loadForUpdate(client, id);
    const isSender = request.sender_id === user.id;
    const isReceiver = request.receiver_id === user.id;
    if (!isSender && !isReceiver) throw ApiError.forbidden('You are not part of this exchange request.');

    if (request.status === 'PENDING') {
      if (!isSender) throw ApiError.forbidden('Only the sender can cancel a pending request.');
    } else if (request.status === 'ACCEPTED') {
      const completed = await client.query(
        "SELECT 1 FROM sessions WHERE exchange_request_id = $1 AND status = 'COMPLETED'",
        [id],
      );
      if (completed.rows[0]) throw ApiError.conflict('This exchange already has a completed session.');
      const disputed = await client.query(
        "SELECT 1 FROM session_payments WHERE exchange_request_id = $1 AND status = 'DISPUTED'",
        [id],
      );
      if (disputed.rows[0]) throw ApiError.conflict('This exchange is under review and cannot be cancelled right now.');
      await client.query(
        "UPDATE sessions SET status = 'CANCELLED', updated_at = NOW() WHERE exchange_request_id = $1 AND status = 'SCHEDULED'",
        [id],
      );
    } else {
      throw ApiError.conflict('This request can no longer be cancelled.');
    }

    await client.query("UPDATE exchange_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [id]);
    await refundReservation(client, id, `Refund – ${request.skill_name} exchange was cancelled`);
    const otherId = isSender ? request.receiver_id : request.sender_id;
    await notify(
      otherId,
      {
        type: 'REQUEST_CANCELLED',
        title: 'Exchange cancelled',
        message: `${isSender ? request.sender_name : request.receiver_name} cancelled the ${request.skill_name} exchange.`,
        link: `/app/requests?tab=${isSender ? 'received' : 'sent'}`,
      },
      client,
    );
  });
  return getRequest(id, user);
}

// ---------- admin ----------

export async function adminListRequests(params) {
  const pagination = parsePagination(params, { limit: 20 });
  const conditions = [];
  const values = [];
  if (params.status) {
    values.push(params.status);
    conditions.push(`er.status = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    conditions.push(`(su.full_name ILIKE $${values.length} OR ru.full_name ILIKE $${values.length} OR sk.name ILIKE $${values.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${REQUEST_SELECT} ${REQUEST_FROM} ${where} ORDER BY er.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total ${REQUEST_FROM} ${where}`, values),
  ]);
  return paginatedResult(rows.map((row) => mapRequest(row, null)), count.rows[0].total, pagination);
}
