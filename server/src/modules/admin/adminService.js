import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { escapeLike } from '../../utils/sanitize.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { audit } from './auditService.js';

export async function dashboardStats() {
  const [{ rows: stats }, requestsByStatus, signups, sessionsByStatus, topSkills] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'USER') AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'USER' AND status = 'ACTIVE') AS active_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'USER' AND status = 'SUSPENDED') AS suspended_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'USER' AND created_at >= NOW() - INTERVAL '30 days') AS new_users_30d,
        (SELECT COUNT(*)::int FROM skills WHERE status = 'ACTIVE') AS total_skills,
        (SELECT COUNT(*)::int FROM categories) AS total_categories,
        (SELECT COUNT(*)::int FROM exchange_requests) AS total_requests,
        (SELECT COUNT(*)::int FROM exchange_requests WHERE status = 'PENDING') AS pending_requests,
        (SELECT COUNT(*)::int FROM exchange_requests WHERE status = 'ACCEPTED') AS accepted_requests,
        (SELECT COUNT(*)::int FROM exchange_requests WHERE status = 'COMPLETED') AS completed_exchanges,
        (SELECT COUNT(*)::int FROM sessions WHERE status = 'SCHEDULED' AND (scheduled_date + end_time) >= NOW()) AS upcoming_sessions,
        (SELECT COUNT(*)::int FROM sessions WHERE status = 'COMPLETED') AS completed_sessions,
        (SELECT COUNT(*)::int FROM reports WHERE status IN ('OPEN', 'UNDER_REVIEW')) AS open_reports,
        (SELECT COUNT(*)::int FROM reviews WHERE status = 'VISIBLE') AS total_reviews,
        (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE status = 'VISIBLE') AS average_rating,
        (SELECT COUNT(*)::int FROM messages) AS total_messages,
        (SELECT COALESCE(SUM(available_balance + reserved_balance), 0)::int FROM wallets) AS points_in_circulation,
        (SELECT COUNT(*)::int FROM session_payments WHERE status = 'DISPUTED') AS disputed_payments
    `),
    query('SELECT status, COUNT(*)::int AS count FROM exchange_requests GROUP BY status'),
    query(`
      SELECT TO_CHAR(month, 'YYYY-MM') AS month, COALESCE(c.count, 0)::int AS count
      FROM generate_series(DATE_TRUNC('month', NOW()) - INTERVAL '5 months', DATE_TRUNC('month', NOW()), INTERVAL '1 month') AS month
      LEFT JOIN (
        SELECT DATE_TRUNC('month', created_at) AS m, COUNT(*) AS count FROM users WHERE role = 'USER' GROUP BY 1
      ) c ON c.m = month
      ORDER BY month`),
    query('SELECT status, COUNT(*)::int AS count FROM sessions GROUP BY status'),
    query(`
      SELECT s.name, COUNT(*)::int AS count FROM user_skills us JOIN skills s ON s.id = us.skill_id
      WHERE us.type = 'TEACHES' GROUP BY s.name ORDER BY count DESC, s.name LIMIT 6`),
  ]);
  const s = stats[0];
  return {
    totals: {
      totalUsers: s.total_users,
      activeUsers: s.active_users,
      suspendedUsers: s.suspended_users,
      newUsers30d: s.new_users_30d,
      totalSkills: s.total_skills,
      totalCategories: s.total_categories,
      totalRequests: s.total_requests,
      pendingRequests: s.pending_requests,
      acceptedRequests: s.accepted_requests,
      completedExchanges: s.completed_exchanges,
      upcomingSessions: s.upcoming_sessions,
      completedSessions: s.completed_sessions,
      openReports: s.open_reports,
      totalReviews: s.total_reviews,
      averageRating: s.average_rating !== null ? Number(s.average_rating) : null,
      totalMessages: s.total_messages,
      pointsInCirculation: s.points_in_circulation,
      disputedPayments: s.disputed_payments,
    },
    charts: {
      requestsByStatus: requestsByStatus.rows,
      signupsByMonth: signups.rows,
      sessionsByStatus: sessionsByStatus.rows,
      topTaughtSkills: topSkills.rows,
    },
  };
}

export async function listUsers(params) {
  const pagination = parsePagination(params, { limit: 15 });
  const conditions = [];
  const values = [];
  if (params.q) {
    values.push(`%${escapeLike(params.q)}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  if (params.status) {
    values.push(params.status);
    conditions.push(`u.status = $${values.length}`);
  }
  if (params.role) {
    values.push(params.role);
    conditions.push(`u.role = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = params.sort === 'name' ? 'u.full_name ASC' : params.sort === 'oldest' ? 'u.created_at ASC' : 'u.created_at DESC';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.last_login_at, p.avatar_url, p.location,
              (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.reviewed_user_id = u.id AND r.status = 'VISIBLE') AS rating,
              (SELECT COUNT(*)::int FROM exchange_requests er WHERE er.status = 'COMPLETED' AND (er.sender_id = u.id OR er.receiver_id = u.id)) AS completed_exchanges,
              (SELECT COUNT(*)::int FROM reports rp WHERE rp.reported_user_id = u.id) AS report_count,
              w.available_balance, w.reserved_balance
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN wallets w ON w.user_id = u.id
       ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, values),
  ]);
  return paginatedResult(
    rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      status: row.status,
      avatarUrl: row.avatar_url,
      location: row.location,
      rating: row.rating !== null ? Number(row.rating) : null,
      completedExchanges: row.completed_exchanges,
      reportCount: row.report_count,
      points: { available: row.available_balance ?? 0, reserved: row.reserved_balance ?? 0 },
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    })),
    count.rows[0].total,
    pagination,
  );
}

export async function setUserStatus(admin, userId, status, reason) {
  if (userId === admin.id) throw ApiError.badRequest('You cannot change your own account status.');
  const { rows } = await query('SELECT id, role, status, full_name FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role === 'ADMIN') throw ApiError.forbidden('Administrator accounts cannot be suspended here.');
  if (user.status === status) return { id: user.id, status };

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, userId]);
    await audit(admin.id, status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED', 'USER', userId, { reason }, client);
    await notify(
      userId,
      status === 'SUSPENDED'
        ? { type: 'ACCOUNT_SUSPENDED', title: 'Account suspended', message: `Your account has been suspended.${reason ? ` Reason: ${reason}` : ''}` }
        : { type: 'ACCOUNT_ACTIVATED', title: 'Account reactivated', message: 'Your account is active again. Welcome back!' },
      client,
    );
  });
  return { id: user.id, status };
}
