import { query } from '../../db/pool.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';

/** Record an administrative action. Pass a client to log inside a transaction. */
export async function audit(adminId, action, targetType, targetId, details = null, client) {
  const runner = client ?? { query };
  await runner.query(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId ?? null, details ? JSON.stringify(details) : null],
  );
}

export async function listAuditLogs(params) {
  const pagination = parsePagination(params, { limit: 25 });
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
              u.id AS admin_id, u.full_name AS admin_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pagination.limit, pagination.offset],
    ),
    query('SELECT COUNT(*)::int AS total FROM audit_logs'),
  ]);
  return paginatedResult(
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at,
      admin: row.admin_id ? { id: row.admin_id, fullName: row.admin_name } : null,
    })),
    count.rows[0].total,
    pagination,
  );
}
