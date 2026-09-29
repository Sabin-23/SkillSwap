import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { grantBonus, settlePayment } from '../points/pointsService.js';

const SESSION_SELECT = `
  s.id, s.exchange_request_id, s.scheduled_date, s.start_time, s.end_time, s.format, s.location, s.meeting_link,
  s.notes, s.status, s.completed_at, s.created_at, s.updated_at,
  s.host_id, hu.full_name AS host_name, hp.avatar_url AS host_avatar,
  s.participant_id, pu.full_name AS participant_name, pp.avatar_url AS participant_avatar,
  sk.id AS skill_id, sk.name AS skill_name,
  er.point_cost, er.duration_minutes, pay.status AS payment_status,
  (s.scheduled_date + s.start_time) <= NOW() AS has_started`;

const SESSION_FROM = `
  FROM sessions s
  JOIN users hu ON hu.id = s.host_id
  JOIN profiles hp ON hp.user_id = hu.id
  JOIN users pu ON pu.id = s.participant_id
  JOIN profiles pp ON pp.user_id = pu.id
  JOIN skills sk ON sk.id = s.skill_id
  JOIN exchange_requests er ON er.id = s.exchange_request_id
  LEFT JOIN session_payments pay ON pay.exchange_request_id = er.id`;

function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function mapSession(row, viewerId) {
  return {
    id: row.id,
    exchangeRequestId: row.exchange_request_id,
    host: { id: row.host_id, fullName: row.host_name, avatarUrl: row.host_avatar },
    participant: { id: row.participant_id, fullName: row.participant_name, avatarUrl: row.participant_avatar },
    partner:
      viewerId === row.host_id
        ? { id: row.participant_id, fullName: row.participant_name, avatarUrl: row.participant_avatar }
        : { id: row.host_id, fullName: row.host_name, avatarUrl: row.host_avatar },
    role: viewerId == null ? null : viewerId === row.host_id ? 'TEACHER' : 'LEARNER',
    skill: { id: row.skill_id, name: row.skill_name },
    scheduledDate: formatDate(row.scheduled_date),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    format: row.format,
    location: row.location,
    meetingLink: row.meeting_link,
    notes: row.notes,
    status: row.status,
    paymentStatus: row.payment_status,
    pointCost: row.point_cost,
    hasStarted: row.has_started,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertFutureOrToday(scheduledDate, startTime) {
  const start = new Date(`${scheduledDate}T${startTime}:00`);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Invalid session date or time.');
  if (start.getTime() < Date.now() - 60_000) {
    throw ApiError.badRequest('Session date and time must be in the future.', {
      fields: { scheduledDate: 'Choose a future date and time.' },
    });
  }
}

function validateFormatDetails(data) {
  if (data.format === 'ONLINE' && data.location) data.location = null;
  if (data.format === 'IN_PERSON') {
    if (!data.location) {
      throw ApiError.badRequest('Please provide a location for an in-person session.', {
        fields: { location: 'Location is required for in-person sessions.' },
      });
    }
    data.meetingLink = null;
  }
}

export async function getSession(id, viewer) {
  const { rows } = await query(`SELECT ${SESSION_SELECT} ${SESSION_FROM} WHERE s.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Session not found.');
  if (viewer && viewer.role !== 'ADMIN' && row.host_id !== viewer.id && row.participant_id !== viewer.id) {
    throw ApiError.forbidden('You are not part of this session.');
  }
  return mapSession(row, viewer?.id);
}

export async function listSessions(userId, params) {
  const pagination = parsePagination(params, { limit: 10 });
  const values = [userId];
  const conditions = ['(s.host_id = $1 OR s.participant_id = $1)'];
  let orderBy = 's.scheduled_date ASC, s.start_time ASC';
  switch (params.view) {
    case 'upcoming':
      conditions.push("s.status = 'SCHEDULED'", '(s.scheduled_date + s.end_time) >= NOW()');
      break;
    case 'today':
      conditions.push("s.status = 'SCHEDULED'", 's.scheduled_date = CURRENT_DATE');
      break;
    case 'past':
      conditions.push("(s.status = 'COMPLETED' OR (s.status = 'SCHEDULED' AND (s.scheduled_date + s.end_time) < NOW()))");
      orderBy = 's.scheduled_date DESC, s.start_time DESC';
      break;
    case 'cancelled':
      conditions.push("s.status = 'CANCELLED'");
      orderBy = 's.updated_at DESC';
      break;
    default:
      orderBy = 's.scheduled_date DESC, s.start_time DESC';
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [{ rows }, count] = await Promise.all([
    query(`SELECT ${SESSION_SELECT} ${SESSION_FROM} ${where} ORDER BY ${orderBy} LIMIT $2 OFFSET $3`, [
      userId,
      pagination.limit,
      pagination.offset,
    ]),
    query(`SELECT COUNT(*)::int AS total FROM sessions s ${where}`, [userId]),
  ]);
  return paginatedResult(rows.map((row) => mapSession(row, userId)), count.rows[0].total, pagination);
}

export async function createSession(user, data) {
  validateFormatDetails(data);
  assertFutureOrToday(data.scheduledDate, data.startTime);

  const sessionId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT er.*, sk.name AS skill_name FROM exchange_requests er JOIN skills sk ON sk.id = er.skill_id
       WHERE er.id = $1 FOR UPDATE OF er`,
      [data.exchangeRequestId],
    );
    const request = rows[0];
    if (!request) throw ApiError.notFound('Exchange request not found.');
    if (request.sender_id !== user.id && request.receiver_id !== user.id) {
      throw ApiError.forbidden('You are not part of this exchange request.');
    }
    if (request.status !== 'ACCEPTED') {
      throw ApiError.conflict('Sessions can only be scheduled for accepted requests.');
    }
    const existing = await client.query(
      "SELECT id FROM sessions WHERE exchange_request_id = $1 AND status = 'SCHEDULED'",
      [request.id],
    );
    if (existing.rows[0]) throw ApiError.conflict('This exchange already has a scheduled session. Reschedule it instead.');

    const inserted = await client.query(
      `INSERT INTO sessions (exchange_request_id, host_id, participant_id, skill_id, scheduled_date, start_time, end_time,
                             format, location, meeting_link, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        request.id,
        request.receiver_id,
        request.sender_id,
        request.skill_id,
        data.scheduledDate,
        data.startTime,
        data.endTime,
        data.format,
        data.location || null,
        data.meetingLink || null,
        data.notes || null,
      ],
    );
    const otherId = user.id === request.sender_id ? request.receiver_id : request.sender_id;
    await notify(
      otherId,
      {
        type: 'SESSION_SCHEDULED',
        title: 'Session scheduled',
        message: `${user.full_name} scheduled a ${request.skill_name} session on ${data.scheduledDate} at ${data.startTime}.`,
        link: '/app/sessions',
      },
      client,
    );
    return inserted.rows[0].id;
  });
  return getSession(sessionId, user);
}

async function loadForUpdate(client, id, user) {
  const { rows } = await client.query(
    `SELECT s.*, sk.name AS skill_name FROM sessions s JOIN skills sk ON sk.id = s.skill_id WHERE s.id = $1 FOR UPDATE OF s`,
    [id],
  );
  const session = rows[0];
  if (!session) throw ApiError.notFound('Session not found.');
  if (session.host_id !== user.id && session.participant_id !== user.id) {
    throw ApiError.forbidden('You are not part of this session.');
  }
  return session;
}

export async function updateSession(user, id, data) {
  await withTransaction(async (client) => {
    const session = await loadForUpdate(client, id, user);
    if (session.status !== 'SCHEDULED') throw ApiError.conflict('Only scheduled sessions can be changed.');

    const merged = {
      scheduledDate: data.scheduledDate ?? formatDate(session.scheduled_date),
      startTime: data.startTime ?? String(session.start_time).slice(0, 5),
      endTime: data.endTime ?? String(session.end_time).slice(0, 5),
      format: data.format ?? session.format,
      location: data.location !== undefined ? data.location : session.location,
      meetingLink: data.meetingLink !== undefined ? data.meetingLink : session.meeting_link,
      notes: data.notes !== undefined ? data.notes : session.notes,
    };
    if (merged.endTime <= merged.startTime) {
      throw ApiError.badRequest('End time must be after the start time.', { fields: { endTime: 'End time must be after start time.' } });
    }
    validateFormatDetails(merged);
    assertFutureOrToday(merged.scheduledDate, merged.startTime);

    await client.query(
      `UPDATE sessions SET scheduled_date = $2, start_time = $3, end_time = $4, format = $5, location = $6,
                           meeting_link = $7, notes = $8, updated_at = NOW()
       WHERE id = $1`,
      [id, merged.scheduledDate, merged.startTime, merged.endTime, merged.format, merged.location || null, merged.meetingLink || null, merged.notes || null],
    );
    const otherId = user.id === session.host_id ? session.participant_id : session.host_id;
    await notify(
      otherId,
      {
        type: 'SESSION_UPDATED',
        title: 'Session updated',
        message: `${user.full_name} updated the ${session.skill_name} session. It is now on ${merged.scheduledDate} at ${merged.startTime}.`,
        link: '/app/sessions',
      },
      client,
    );
  });
  return getSession(id, user);
}

export async function cancelSession(user, id) {
  await withTransaction(async (client) => {
    const session = await loadForUpdate(client, id, user);
    if (session.status !== 'SCHEDULED') throw ApiError.conflict('Only scheduled sessions can be cancelled.');
    await client.query("UPDATE sessions SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [id]);
    const otherId = user.id === session.host_id ? session.participant_id : session.host_id;
    await notify(
      otherId,
      {
        type: 'SESSION_CANCELLED',
        title: 'Session cancelled',
        message: `${user.full_name} cancelled the ${session.skill_name} session. Points stay reserved until you reschedule or cancel the exchange.`,
        link: '/app/sessions?view=cancelled',
      },
      client,
    );
  });
  return getSession(id, user);
}

export async function completeSession(user, id) {
  await withTransaction(async (client) => {
    const session = await loadForUpdate(client, id, user);
    if (session.status !== 'SCHEDULED') throw ApiError.conflict('This session is not scheduled.');
    const started = await client.query('SELECT (($1::date + $2::time) <= NOW()) AS started', [
      session.scheduled_date,
      session.start_time,
    ]);
    if (!started.rows[0].started) {
      throw ApiError.conflict('A session can only be marked complete after it has started.');
    }

    await client.query(
      "UPDATE sessions SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id],
    );
    await client.query(
      "UPDATE exchange_requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1",
      [session.exchange_request_id],
    );
    await settlePayment(client, { requestId: session.exchange_request_id, sessionId: id, skillName: session.skill_name });

    const otherId = user.id === session.host_id ? session.participant_id : session.host_id;
    await notify(
      otherId,
      {
        type: 'SESSION_COMPLETED',
        title: 'Session completed',
        message: `${user.full_name} marked the ${session.skill_name} session as completed. You can now leave a review.`,
        link: '/app/requests?tab=completed',
      },
      client,
    );
    await notify(
      user.id,
      {
        type: 'SESSION_COMPLETED',
        title: 'Exchange completed',
        message: `The ${session.skill_name} exchange is complete. Leave a review for your partner.`,
        link: '/app/requests?tab=completed',
      },
      client,
    );

    const taught = await client.query(
      "SELECT COUNT(*)::int AS count FROM sessions WHERE host_id = $1 AND status = 'COMPLETED'",
      [session.host_id],
    );
    if (taught.rows[0].count >= 1) await grantBonus(session.host_id, 'FIRST_TEACHING_SESSION', client);
    if (taught.rows[0].count >= 5) await grantBonus(session.host_id, 'FIVE_TEACHING_SESSIONS', client);
  });
  return getSession(id, user);
}

// ---------- admin ----------

export async function adminListSessions(params) {
  const pagination = parsePagination(params, { limit: 20 });
  const conditions = [];
  const values = [];
  if (params.status) {
    values.push(params.status);
    conditions.push(`s.status = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    conditions.push(`(hu.full_name ILIKE $${values.length} OR pu.full_name ILIKE $${values.length} OR sk.name ILIKE $${values.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${SESSION_SELECT} ${SESSION_FROM} ${where} ORDER BY s.scheduled_date DESC, s.start_time DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total ${SESSION_FROM} ${where}`, values),
  ]);
  return paginatedResult(rows.map((row) => mapSession(row, null)), count.rows[0].total, pagination);
}
