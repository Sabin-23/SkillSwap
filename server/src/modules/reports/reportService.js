import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { audit } from '../admin/auditService.js';
import { markDisputed, resolvePayment } from '../points/pointsService.js';

export const REPORT_REASONS = ['HARASSMENT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'NO_SHOW', 'SCAM', 'SESSION_PROBLEM', 'OTHER'];

const REPORT_SELECT = `
  r.id, r.target_type, r.target_id, r.reason, r.description, r.status, r.admin_response,
  r.resolved_at, r.created_at, r.updated_at,
  r.reporter_id, ru.full_name AS reporter_name, rp.avatar_url AS reporter_avatar,
  r.reported_user_id, tu.full_name AS reported_name, tp.avatar_url AS reported_avatar, tu.status AS reported_status,
  r.resolved_by, au.full_name AS resolver_name`;

const REPORT_FROM = `
  FROM reports r
  JOIN users ru ON ru.id = r.reporter_id
  JOIN profiles rp ON rp.user_id = ru.id
  LEFT JOIN users tu ON tu.id = r.reported_user_id
  LEFT JOIN profiles tp ON tp.user_id = tu.id
  LEFT JOIN users au ON au.id = r.resolved_by`;

function mapReport(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    description: row.description,
    status: row.status,
    adminResponse: row.admin_response,
    reporter: { id: row.reporter_id, fullName: row.reporter_name, avatarUrl: row.reporter_avatar },
    reportedUser: row.reported_user_id
      ? { id: row.reported_user_id, fullName: row.reported_name, avatarUrl: row.reported_avatar, status: row.reported_status }
      : null,
    resolvedBy: row.resolved_by ? { id: row.resolved_by, fullName: row.resolver_name } : null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Resolve who is being reported and validate the target exists. */
async function resolveTarget(reporterId, { targetType, targetId, reportedUserId }) {
  switch (targetType) {
    case 'USER': {
      const { rows } = await query('SELECT id FROM users WHERE id = $1', [reportedUserId ?? targetId]);
      if (!rows[0]) throw ApiError.notFound('User not found.');
      return { reportedUserId: rows[0].id, targetId: rows[0].id, requestId: null };
    }
    case 'MESSAGE': {
      const { rows } = await query('SELECT id, sender_id, receiver_id FROM messages WHERE id = $1', [targetId]);
      const message = rows[0];
      if (!message || (message.sender_id !== reporterId && message.receiver_id !== reporterId)) {
        throw ApiError.notFound('Message not found.');
      }
      if (message.sender_id === reporterId) throw ApiError.badRequest('You cannot report your own message.');
      return { reportedUserId: message.sender_id, targetId, requestId: null };
    }
    case 'REVIEW': {
      const { rows } = await query('SELECT id, reviewer_id, reviewed_user_id FROM reviews WHERE id = $1', [targetId]);
      const review = rows[0];
      if (!review) throw ApiError.notFound('Review not found.');
      if (review.reviewer_id === reporterId) throw ApiError.badRequest('You cannot report your own review.');
      return { reportedUserId: review.reviewer_id, targetId, requestId: null };
    }
    case 'SESSION': {
      const { rows } = await query('SELECT id, host_id, participant_id, exchange_request_id FROM sessions WHERE id = $1', [targetId]);
      const session = rows[0];
      if (!session || (session.host_id !== reporterId && session.participant_id !== reporterId)) {
        throw ApiError.notFound('Session not found.');
      }
      return {
        reportedUserId: session.host_id === reporterId ? session.participant_id : session.host_id,
        targetId,
        requestId: session.exchange_request_id,
      };
    }
    default: {
      if (!reportedUserId) throw ApiError.badRequest('Please indicate which user this report concerns.');
      const { rows } = await query('SELECT id FROM users WHERE id = $1', [reportedUserId]);
      if (!rows[0]) throw ApiError.notFound('User not found.');
      return { reportedUserId, targetId: targetId ?? null, requestId: null };
    }
  }
}

export async function createReport(user, data) {
  const target = await resolveTarget(user.id, data);
  if (target.reportedUserId === user.id) throw ApiError.badRequest('You cannot report yourself.');

  const duplicate = await query(
    `SELECT id FROM reports WHERE reporter_id = $1 AND target_type = $2 AND COALESCE(target_id, 0) = COALESCE($3, 0)
       AND reported_user_id = $4 AND status IN ('OPEN', 'UNDER_REVIEW')`,
    [user.id, data.targetType, target.targetId, target.reportedUserId],
  );
  if (duplicate.rows[0]) throw ApiError.conflict('You already have an open report for this.');

  const reportId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO reports (reporter_id, reported_user_id, target_type, target_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, target.reportedUserId, data.targetType, target.targetId, data.reason, data.description],
    );
    if (target.requestId) {
      // Session dispute: freeze the point reservation until an administrator decides.
      await markDisputed(client, target.requestId);
    }
    const admins = await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    for (const admin of admins.rows) {
      await notify(
        admin.id,
        {
          type: 'REPORT_CREATED',
          title: 'New report submitted',
          message: `${user.full_name} reported a ${data.targetType.toLowerCase()} (${data.reason.replace(/_/g, ' ').toLowerCase()}).`,
          link: `/admin/reports?id=${rows[0].id}`,
        },
        client,
      );
    }
    await notify(
      user.id,
      {
        type: 'REPORT_STATUS',
        title: 'Report received',
        message: 'Thank you. Our moderators will review your report shortly.',
        link: '/app/settings',
      },
      client,
    );
    return rows[0].id;
  });
  return getReport(reportId);
}

export async function getReport(id) {
  const { rows } = await query(`SELECT ${REPORT_SELECT} ${REPORT_FROM} WHERE r.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Report not found.');
  const report = mapReport(rows[0]);
  report.evidence = await loadEvidence(report);
  return report;
}

async function loadEvidence(report) {
  switch (report.targetType) {
    case 'MESSAGE': {
      const { rows } = await query('SELECT id, content, created_at, deleted_at FROM messages WHERE id = $1', [report.targetId]);
      return rows[0] ? { type: 'MESSAGE', content: rows[0].deleted_at ? null : rows[0].content, createdAt: rows[0].created_at, deleted: Boolean(rows[0].deleted_at) } : null;
    }
    case 'REVIEW': {
      const { rows } = await query('SELECT id, rating, comment, status, created_at FROM reviews WHERE id = $1', [report.targetId]);
      return rows[0] ? { type: 'REVIEW', rating: rows[0].rating, comment: rows[0].comment, status: rows[0].status, createdAt: rows[0].created_at } : null;
    }
    case 'SESSION': {
      const { rows } = await query(
        `SELECT s.id, s.scheduled_date, s.start_time, s.end_time, s.status, s.format, sk.name AS skill_name,
                s.exchange_request_id, sp.status AS payment_status, sp.points
         FROM sessions s JOIN skills sk ON sk.id = s.skill_id
         LEFT JOIN session_payments sp ON sp.exchange_request_id = s.exchange_request_id
         WHERE s.id = $1`,
        [report.targetId],
      );
      const s = rows[0];
      return s
        ? {
            type: 'SESSION',
            skillName: s.skill_name,
            scheduledDate: s.scheduled_date,
            startTime: String(s.start_time).slice(0, 5),
            endTime: String(s.end_time).slice(0, 5),
            status: s.status,
            format: s.format,
            exchangeRequestId: s.exchange_request_id,
            paymentStatus: s.payment_status,
            points: s.points,
          }
        : null;
    }
    default:
      return null;
  }
}

export async function listMyReports(userId) {
  const { rows } = await query(`SELECT ${REPORT_SELECT} ${REPORT_FROM} WHERE r.reporter_id = $1 ORDER BY r.created_at DESC`, [userId]);
  return rows.map(mapReport);
}

export async function adminListReports(params) {
  const pagination = parsePagination(params, { limit: 20 });
  const conditions = [];
  const values = [];
  if (params.status) {
    values.push(params.status);
    conditions.push(`r.status = $${values.length}`);
  }
  if (params.targetType) {
    values.push(params.targetType);
    conditions.push(`r.target_type = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${REPORT_SELECT} ${REPORT_FROM} ${where}
       ORDER BY CASE r.status WHEN 'OPEN' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END, r.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM reports r ${where}`, values),
  ]);
  return paginatedResult(rows.map(mapReport), count.rows[0].total, pagination);
}

/**
 * Admin update. `status` moves the report along; optional `actions` apply
 * moderation: suspendUser, removeContent, and paymentAction for session disputes.
 */
export async function adminUpdateReport(admin, id, data) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [id]);
    const report = rows[0];
    if (!report) throw ApiError.notFound('Report not found.');

    const applied = [];

    if (data.suspendUser && report.reported_user_id) {
      await client.query("UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1 AND role = 'USER'", [report.reported_user_id]);
      await audit(admin.id, 'USER_SUSPENDED', 'USER', report.reported_user_id, { reportId: id }, client);
      await notify(
        report.reported_user_id,
        { type: 'ACCOUNT_SUSPENDED', title: 'Account suspended', message: 'Your account was suspended following a moderation review.' },
        client,
      );
      applied.push('User suspended');
    }

    if (data.removeContent) {
      if (report.target_type === 'MESSAGE') {
        await client.query('UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [report.target_id]);
        await audit(admin.id, 'MESSAGE_REMOVED', 'MESSAGE', report.target_id, { reportId: id }, client);
        applied.push('Message removed');
      } else if (report.target_type === 'REVIEW') {
        await client.query("UPDATE reviews SET status = 'REMOVED', updated_at = NOW() WHERE id = $1", [report.target_id]);
        await audit(admin.id, 'REVIEW_REMOVED', 'REVIEW', report.target_id, { reportId: id }, client);
        applied.push('Review removed');
      }
    }

    if (data.paymentAction && report.target_type === 'SESSION') {
      const session = await client.query('SELECT exchange_request_id FROM sessions WHERE id = $1', [report.target_id]);
      if (session.rows[0]) {
        const outcome = await resolvePayment(client, admin.id, session.rows[0].exchange_request_id, {
          action: data.paymentAction,
          teacherPoints: data.teacherPoints,
          reason: data.adminResponse || `Report #${id} resolution`,
        });
        applied.push(`Points: ${outcome.toTeacher} to teacher, ${outcome.toLearner} to learner`);
        if (data.paymentAction === 'REFUND') {
          await client.query(
            "UPDATE sessions SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND status = 'SCHEDULED'",
            [report.target_id],
          );
          await client.query(
            "UPDATE exchange_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND status IN ('ACCEPTED', 'PENDING')",
            [session.rows[0].exchange_request_id],
          );
        } else {
          await client.query(
            "UPDATE sessions SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'SCHEDULED'",
            [report.target_id],
          );
          await client.query(
            "UPDATE exchange_requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND status = 'ACCEPTED'",
            [session.rows[0].exchange_request_id],
          );
        }
      }
    }

    const newStatus = data.status ?? report.status;
    const resolved = ['RESOLVED', 'DISMISSED'].includes(newStatus);
    await client.query(
      `UPDATE reports SET status = $2, admin_response = COALESCE($3, admin_response),
              resolved_by = CASE WHEN $4 THEN $5 ELSE resolved_by END,
              resolved_at = CASE WHEN $4 THEN NOW() ELSE resolved_at END,
              updated_at = NOW()
       WHERE id = $1`,
      [id, newStatus, data.adminResponse ?? null, resolved, admin.id],
    );
    await audit(admin.id, 'REPORT_UPDATED', 'REPORT', id, { status: newStatus, applied, response: data.adminResponse }, client);

    if (newStatus !== report.status) {
      await notify(
        report.reporter_id,
        {
          type: 'REPORT_STATUS',
          title: `Report ${newStatus.replace('_', ' ').toLowerCase()}`,
          message: resolved
            ? `Your report has been ${newStatus.toLowerCase()}.${data.adminResponse ? ` Moderator note: ${data.adminResponse}` : ''}`
            : 'A moderator is now reviewing your report.',
          link: '/app/settings',
        },
        client,
      );
    }
  });
  return getReport(id);
}
