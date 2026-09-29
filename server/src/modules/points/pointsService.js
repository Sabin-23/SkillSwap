import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';
import { audit } from '../admin/auditService.js';

/**
 * SkillSwap Points engine.
 *
 * Every balance change goes through this module and is executed inside a
 * database transaction with the wallet row locked (SELECT ... FOR UPDATE).
 * Every change writes a row to `point_transactions`; the ledger tracks the
 * user's *available* balance. Reservations (holds) are recorded so users can
 * see them, and are released either as a REFUND or settled as a SESSION_PAYMENT.
 */

// ---------- wallet helpers ----------

export async function ensureWallet(userId, client) {
  const runner = client ?? { query };
  await runner.query(
    'INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId],
  );
}

async function lockWallet(client, userId) {
  await ensureWallet(userId, client);
  const { rows } = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  return rows[0];
}

async function saveWallet(client, wallet) {
  if (wallet.available_balance < 0 || wallet.reserved_balance < 0) {
    throw ApiError.conflict('Point balance cannot become negative.');
  }
  await client.query(
    'UPDATE wallets SET available_balance = $2, reserved_balance = $3, updated_at = NOW() WHERE id = $1',
    [wallet.id, wallet.available_balance, wallet.reserved_balance],
  );
}

async function recordTransaction(client, wallet, tx) {
  const { rows } = await client.query(
    `INSERT INTO point_transactions
       (wallet_id, user_id, amount, transaction_type, description, reference_type, reference_id, balance_after, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      wallet.id,
      wallet.user_id,
      tx.amount,
      tx.type,
      tx.description,
      tx.referenceType ?? null,
      tx.referenceId != null ? String(tx.referenceId) : null,
      wallet.available_balance,
      tx.createdBy ?? null,
    ],
  );
  return rows[0].id;
}

// ---------- rates ----------

export async function listRates({ includeInactive = false } = {}) {
  const { rows } = await query(
    `SELECT id, duration_minutes, point_cost, active, created_at, updated_at
     FROM session_point_rates ${includeInactive ? '' : 'WHERE active = TRUE'}
     ORDER BY duration_minutes`,
  );
  return rows.map(mapRate);
}

export async function getRateForDuration(durationMinutes, client) {
  const runner = client ?? { query };
  const { rows } = await runner.query(
    'SELECT * FROM session_point_rates WHERE duration_minutes = $1 AND active = TRUE',
    [durationMinutes],
  );
  if (!rows[0]) throw ApiError.badRequest('That session duration is not available.');
  return mapRate(rows[0]);
}

// ---------- reservation / settlement ----------

/** Hold the learner's points for a new exchange request. */
export async function reserveForRequest(client, { learnerId, teacherId, requestId, points, skillName, teacherName }) {
  const wallet = await lockWallet(client, learnerId);
  if (wallet.available_balance < points) {
    throw ApiError.badRequest('Insufficient SkillSwap Points. Teach a skill to earn more points.');
  }
  wallet.available_balance -= points;
  wallet.reserved_balance += points;
  await saveWallet(client, wallet);
  await recordTransaction(client, wallet, {
    amount: -points,
    type: 'RESERVATION',
    description: `Points reserved for ${skillName} session with ${teacherName}`,
    referenceType: 'EXCHANGE_REQUEST',
    referenceId: requestId,
  });
  await client.query(
    `INSERT INTO session_payments (exchange_request_id, learner_id, teacher_id, points)
     VALUES ($1, $2, $3, $4)`,
    [requestId, learnerId, teacherId, points],
  );
  await notify(
    learnerId,
    {
      type: 'POINTS_RESERVED',
      title: 'Points reserved',
      message: `${points} SkillSwap Points have been reserved for your ${skillName} request.`,
      link: '/app/points',
    },
    client,
  );
}

/** Return reserved points to the learner (rejection, cancellation, admin refund). */
export async function refundReservation(client, requestId, reason, { adminId } = {}) {
  const { rows } = await client.query(
    'SELECT * FROM session_payments WHERE exchange_request_id = $1 FOR UPDATE',
    [requestId],
  );
  const payment = rows[0];
  if (!payment || !['RESERVED', 'DISPUTED'].includes(payment.status)) return null;

  const wallet = await lockWallet(client, payment.learner_id);
  wallet.reserved_balance -= payment.points;
  wallet.available_balance += payment.points;
  await saveWallet(client, wallet);
  await recordTransaction(client, wallet, {
    amount: payment.points,
    type: adminId ? 'ADMIN_ADJUSTMENT' : 'REFUND',
    description: reason,
    referenceType: 'EXCHANGE_REQUEST',
    referenceId: requestId,
    createdBy: adminId,
  });
  await client.query(
    "UPDATE session_payments SET status = 'REFUNDED', completed_at = NOW() WHERE id = $1",
    [payment.id],
  );
  await notify(
    payment.learner_id,
    {
      type: 'POINTS_REFUNDED',
      title: 'Points refunded',
      message: `Your ${payment.points} SkillSwap Points have been refunded.`,
      link: '/app/points',
    },
    client,
  );
  return payment;
}

/** Transfer reserved points from learner to teacher when a session is completed. */
export async function settlePayment(client, { requestId, sessionId, skillName }) {
  const { rows } = await client.query(
    'SELECT * FROM session_payments WHERE exchange_request_id = $1 FOR UPDATE',
    [requestId],
  );
  const payment = rows[0];
  if (!payment) return null;
  if (payment.status === 'DISPUTED') {
    throw ApiError.conflict('This session is under review. Points will be released when the dispute is resolved.');
  }
  if (payment.status !== 'RESERVED') return payment; // already settled: nothing to do

  const learnerWallet = await lockWallet(client, payment.learner_id);
  learnerWallet.reserved_balance -= payment.points;
  await saveWallet(client, learnerWallet);
  await recordTransaction(client, learnerWallet, {
    amount: -payment.points,
    type: 'SESSION_PAYMENT',
    description: `Learning session – ${skillName}`,
    referenceType: 'EXCHANGE_REQUEST',
    referenceId: requestId,
  });

  const teacherWallet = await lockWallet(client, payment.teacher_id);
  teacherWallet.available_balance += payment.points;
  await saveWallet(client, teacherWallet);
  await recordTransaction(client, teacherWallet, {
    amount: payment.points,
    type: 'SESSION_REWARD',
    description: `Session completed – ${skillName}`,
    referenceType: 'EXCHANGE_REQUEST',
    referenceId: requestId,
  });

  await client.query(
    "UPDATE session_payments SET status = 'COMPLETED', session_id = $2, completed_at = NOW() WHERE id = $1",
    [payment.id, sessionId ?? null],
  );

  await notify(
    payment.teacher_id,
    {
      type: 'POINTS_EARNED',
      title: 'Points earned',
      message: `You earned ${payment.points} SkillSwap Points for completing a ${skillName} session.`,
      link: '/app/points',
    },
    client,
  );
  await notify(
    payment.learner_id,
    {
      type: 'POINTS_SPENT',
      title: 'Points spent',
      message: `${payment.points} SkillSwap Points were transferred to your teacher for the ${skillName} session.`,
      link: '/app/points',
    },
    client,
  );
  return payment;
}

/** Freeze a reservation while a reported session is investigated. */
export async function markDisputed(client, requestId) {
  await client.query(
    "UPDATE session_payments SET status = 'DISPUTED' WHERE exchange_request_id = $1 AND status = 'RESERVED'",
    [requestId],
  );
}

/**
 * Admin resolution of a disputed/reserved payment.
 * action: RELEASE (teacher gets everything), REFUND (learner gets everything),
 * SPLIT (teacherPoints to teacher, remainder back to learner).
 */
export async function resolvePayment(client, adminId, requestId, { action, teacherPoints = 0, reason }) {
  const { rows } = await client.query(
    'SELECT * FROM session_payments WHERE exchange_request_id = $1 FOR UPDATE',
    [requestId],
  );
  const payment = rows[0];
  if (!payment) throw ApiError.notFound('No point reservation exists for this exchange.');
  if (!['RESERVED', 'DISPUTED'].includes(payment.status)) {
    throw ApiError.conflict('This payment has already been settled.');
  }

  let toTeacher;
  if (action === 'RELEASE') toTeacher = payment.points;
  else if (action === 'REFUND') toTeacher = 0;
  else {
    if (!Number.isInteger(teacherPoints) || teacherPoints < 0 || teacherPoints > payment.points) {
      throw ApiError.badRequest(`Teacher points must be between 0 and ${payment.points}.`);
    }
    toTeacher = teacherPoints;
  }
  const toLearner = payment.points - toTeacher;

  const learnerWallet = await lockWallet(client, payment.learner_id);
  learnerWallet.reserved_balance -= payment.points;
  learnerWallet.available_balance += toLearner;
  await saveWallet(client, learnerWallet);
  await recordTransaction(client, learnerWallet, {
    amount: -toTeacher,
    type: 'ADMIN_ADJUSTMENT',
    description: `Dispute resolved by administrator: ${reason}${toLearner ? ` (${toLearner} points returned)` : ''}`,
    referenceType: 'EXCHANGE_REQUEST',
    referenceId: requestId,
    createdBy: adminId,
  });

  if (toTeacher > 0) {
    const teacherWallet = await lockWallet(client, payment.teacher_id);
    teacherWallet.available_balance += toTeacher;
    await saveWallet(client, teacherWallet);
    await recordTransaction(client, teacherWallet, {
      amount: toTeacher,
      type: 'ADMIN_ADJUSTMENT',
      description: `Dispute resolved by administrator: ${reason}`,
      referenceType: 'EXCHANGE_REQUEST',
      referenceId: requestId,
      createdBy: adminId,
    });
  }

  const status = action === 'RELEASE' ? 'COMPLETED' : action === 'REFUND' ? 'REFUNDED' : 'SPLIT';
  await client.query(
    'UPDATE session_payments SET status = $2, completed_at = NOW() WHERE id = $1',
    [payment.id, status],
  );

  for (const userId of [payment.learner_id, payment.teacher_id]) {
    await notify(
      userId,
      {
        type: 'POINTS_ADJUSTED',
        title: 'Dispute resolved',
        message: `An administrator resolved the disputed session. ${toTeacher} points were released to the teacher and ${toLearner} returned to the learner.`,
        link: '/app/points',
      },
      client,
    );
  }
  await audit(adminId, 'PAYMENT_RESOLVED', 'EXCHANGE_REQUEST', requestId, { action, toTeacher, toLearner, reason }, client);
  return { toTeacher, toLearner, status };
}

// ---------- bonuses ----------

/**
 * Grant a configured bonus once per user. Idempotent: the unique index on
 * (user, reference) rejects duplicates, which we swallow.
 */
export async function grantBonus(userId, code, client) {
  const run = async (c) => {
    const { rows } = await c.query('SELECT * FROM point_bonuses WHERE code = $1 AND active = TRUE', [code]);
    const bonus = rows[0];
    if (!bonus || bonus.points <= 0) return null;

    await c.query('SAVEPOINT bonus');
    try {
      const wallet = await lockWallet(c, userId);
      wallet.available_balance += bonus.points;
      await saveWallet(c, wallet);
      await recordTransaction(c, wallet, {
        amount: bonus.points,
        type: 'BONUS',
        description: `Bonus – ${bonus.name}`,
        referenceType: 'BONUS',
        referenceId: bonus.code,
      });
      await c.query('RELEASE SAVEPOINT bonus');
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT bonus');
      if (err.code === '23505') return null; // already granted
      throw err;
    }
    await notify(
      userId,
      {
        type: 'BONUS_RECEIVED',
        title: 'Bonus received',
        message: `You received ${bonus.points} SkillSwap Points: ${bonus.name}.`,
        link: '/app/points',
      },
      c,
    );
    return bonus;
  };
  return client ? run(client) : withTransaction(run);
}

// ---------- admin adjustment ----------

export async function adminAdjust(adminId, { userId, amount, reason }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw ApiError.notFound('User not found.');
    const wallet = await lockWallet(client, userId);
    if (wallet.available_balance + amount < 0) {
      throw ApiError.badRequest('This adjustment would make the balance negative.');
    }
    wallet.available_balance += amount;
    await saveWallet(client, wallet);
    const txId = await recordTransaction(client, wallet, {
      amount,
      type: 'ADMIN_ADJUSTMENT',
      description: `Administrator adjustment: ${reason}`,
      referenceType: 'ADMIN',
      referenceId: adminId,
      createdBy: adminId,
    });
    await notify(
      userId,
      {
        type: 'POINTS_ADJUSTED',
        title: 'Points adjusted',
        message: `An administrator ${amount >= 0 ? 'added' : 'removed'} ${Math.abs(amount)} SkillSwap Points. Reason: ${reason}`,
        link: '/app/points',
      },
      client,
    );
    await audit(adminId, 'POINTS_ADJUSTED', 'USER', userId, { amount, reason, transactionId: txId }, client);
    return { transactionId: txId, availableBalance: wallet.available_balance, reservedBalance: wallet.reserved_balance };
  });
}

// ---------- read models ----------

export async function getWalletSummary(userId) {
  await ensureWallet(userId);
  const { rows } = await query(
    `SELECT w.available_balance, w.reserved_balance,
       COALESCE((SELECT SUM(amount) FROM point_transactions t
                 WHERE t.user_id = w.user_id AND t.amount > 0
                   AND t.transaction_type IN ('SESSION_REWARD', 'BONUS', 'ADMIN_ADJUSTMENT')), 0)::int AS total_earned,
       COALESCE((SELECT -SUM(amount) FROM point_transactions t
                 WHERE t.user_id = w.user_id AND t.amount < 0
                   AND t.transaction_type IN ('SESSION_PAYMENT', 'PENALTY', 'ADMIN_ADJUSTMENT')), 0)::int AS total_spent
     FROM wallets w WHERE w.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    availableBalance: row.available_balance,
    reservedBalance: row.reserved_balance,
    totalBalance: row.available_balance + row.reserved_balance,
    totalEarned: row.total_earned,
    totalSpent: row.total_spent,
  };
}

export async function listTransactions(userId, params) {
  const pagination = parsePagination(params, { limit: 20 });
  const conditions = ['t.user_id = $1'];
  const values = [userId];
  if (params.type) {
    values.push(params.type);
    conditions.push(`t.transaction_type = $${values.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT t.*, er.skill_id, s.name AS skill_name
       FROM point_transactions t
       LEFT JOIN exchange_requests er
         ON t.reference_type = 'EXCHANGE_REQUEST' AND er.id = NULLIF(t.reference_id, '')::int
       LEFT JOIN skills s ON s.id = er.skill_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM point_transactions t ${where}`, values),
  ]);
  return paginatedResult(rows.map(mapTransaction), count.rows[0].total, pagination);
}

export async function listReservations(userId) {
  const result = await query(
    `SELECT sp.id, sp.exchange_request_id, sp.points, sp.status, sp.created_at, sp.completed_at,
            sp.learner_id, sp.teacher_id, s.name AS skill_name, er.status AS request_status,
            t.full_name AS teacher_name, l.full_name AS learner_name
     FROM session_payments sp
     JOIN exchange_requests er ON er.id = sp.exchange_request_id
     JOIN skills s ON s.id = er.skill_id
     JOIN users t ON t.id = sp.teacher_id
     JOIN users l ON l.id = sp.learner_id
     WHERE (sp.learner_id = $1 OR sp.teacher_id = $1) AND sp.status IN ('RESERVED', 'DISPUTED')
     ORDER BY sp.created_at DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    exchangeRequestId: row.exchange_request_id,
    points: row.points,
    status: row.status,
    role: row.learner_id === userId ? 'LEARNER' : 'TEACHER',
    skillName: row.skill_name,
    requestStatus: row.request_status,
    teacherName: row.teacher_name,
    learnerName: row.learner_name,
    createdAt: row.created_at,
  }));
}

// ---------- admin read models ----------

export async function adminOverview() {
  const { rows } = await query(`
    SELECT
      COALESCE(SUM(available_balance), 0)::int AS available_in_circulation,
      COALESCE(SUM(reserved_balance), 0)::int AS reserved_in_circulation,
      (SELECT COUNT(*)::int FROM point_transactions) AS total_transactions,
      (SELECT COUNT(*)::int FROM session_payments WHERE status = 'DISPUTED') AS disputed_payments,
      (SELECT COALESCE(SUM(amount), 0)::int FROM point_transactions WHERE transaction_type = 'SESSION_REWARD') AS total_rewards,
      (SELECT COALESCE(SUM(amount), 0)::int FROM point_transactions WHERE transaction_type = 'BONUS') AS total_bonuses
    FROM wallets`);
  const row = rows[0];
  return {
    availableInCirculation: row.available_in_circulation,
    reservedInCirculation: row.reserved_in_circulation,
    totalInCirculation: row.available_in_circulation + row.reserved_in_circulation,
    totalTransactions: row.total_transactions,
    disputedPayments: row.disputed_payments,
    totalRewards: row.total_rewards,
    totalBonuses: row.total_bonuses,
  };
}

export async function adminListTransactions(params) {
  const pagination = parsePagination(params, { limit: 25 });
  const conditions = [];
  const values = [];
  if (params.type) {
    values.push(params.type);
    conditions.push(`t.transaction_type = $${values.length}`);
  }
  if (params.userId) {
    values.push(Number(params.userId));
    conditions.push(`t.user_id = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT t.*, u.full_name, u.email, s.name AS skill_name
       FROM point_transactions t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN exchange_requests er
         ON t.reference_type = 'EXCHANGE_REQUEST' AND er.id = NULLIF(t.reference_id, '')::int
       LEFT JOIN skills s ON s.id = er.skill_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM point_transactions t JOIN users u ON u.id = t.user_id ${where}`, values),
  ]);
  return paginatedResult(
    rows.map((row) => ({ ...mapTransaction(row), user: { id: row.user_id, fullName: row.full_name, email: row.email } })),
    count.rows[0].total,
    pagination,
  );
}

export async function adminListDisputes() {
  const { rows } = await query(
    `SELECT sp.*, s.name AS skill_name, t.full_name AS teacher_name, l.full_name AS learner_name,
            (SELECT r.id FROM reports r WHERE r.target_type = 'SESSION'
               AND r.target_id IN (SELECT id FROM sessions WHERE exchange_request_id = sp.exchange_request_id)
               AND r.status IN ('OPEN', 'UNDER_REVIEW') ORDER BY r.created_at DESC LIMIT 1) AS report_id
     FROM session_payments sp
     JOIN exchange_requests er ON er.id = sp.exchange_request_id
     JOIN skills s ON s.id = er.skill_id
     JOIN users t ON t.id = sp.teacher_id
     JOIN users l ON l.id = sp.learner_id
     WHERE sp.status = 'DISPUTED'
     ORDER BY sp.created_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    exchangeRequestId: row.exchange_request_id,
    points: row.points,
    status: row.status,
    skillName: row.skill_name,
    teacher: { id: row.teacher_id, fullName: row.teacher_name },
    learner: { id: row.learner_id, fullName: row.learner_name },
    reportId: row.report_id,
    createdAt: row.created_at,
  }));
}

export async function updateRate(adminId, id, data) {
  const fields = [];
  const values = [];
  if (data.pointCost !== undefined) {
    values.push(data.pointCost);
    fields.push(`point_cost = $${values.length}`);
  }
  if (data.active !== undefined) {
    values.push(data.active);
    fields.push(`active = $${values.length}`);
  }
  if (!fields.length) throw ApiError.badRequest('Nothing to update.');
  values.push(id);
  const { rows } = await query(
    `UPDATE session_point_rates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) throw ApiError.notFound('Rate not found.');
  await audit(adminId, 'RATE_UPDATED', 'SESSION_POINT_RATE', id, data);
  return mapRate(rows[0]);
}

export async function createRate(adminId, data) {
  const { rows } = await query(
    `INSERT INTO session_point_rates (duration_minutes, point_cost) VALUES ($1, $2)
     ON CONFLICT (duration_minutes) DO UPDATE SET point_cost = EXCLUDED.point_cost, active = TRUE, updated_at = NOW()
     RETURNING *`,
    [data.durationMinutes, data.pointCost],
  );
  await audit(adminId, 'RATE_CREATED', 'SESSION_POINT_RATE', rows[0].id, data);
  return mapRate(rows[0]);
}

export async function listBonuses() {
  const { rows } = await query('SELECT * FROM point_bonuses ORDER BY id');
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    points: row.points,
    condition: row.condition,
    active: row.active,
    updatedAt: row.updated_at,
  }));
}

export async function updateBonus(adminId, id, data) {
  const fields = [];
  const values = [];
  if (data.points !== undefined) {
    values.push(data.points);
    fields.push(`points = $${values.length}`);
  }
  if (data.active !== undefined) {
    values.push(data.active);
    fields.push(`active = $${values.length}`);
  }
  if (data.description !== undefined) {
    values.push(data.description);
    fields.push(`description = $${values.length}`);
  }
  if (!fields.length) throw ApiError.badRequest('Nothing to update.');
  values.push(id);
  const { rows } = await query(
    `UPDATE point_bonuses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) throw ApiError.notFound('Bonus not found.');
  await audit(adminId, 'BONUS_UPDATED', 'POINT_BONUS', id, data);
  return rows[0];
}

// ---------- mappers ----------

function mapRate(row) {
  return {
    id: row.id,
    durationMinutes: row.duration_minutes,
    pointCost: row.point_cost,
    active: row.active,
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    amount: row.amount,
    type: row.transaction_type,
    description: row.description,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    skillName: row.skill_name ?? null,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  };
}
