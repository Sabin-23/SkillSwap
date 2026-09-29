import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.js';
import { withTransaction } from '../../db/pool.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as admin from './adminService.js';
import { listAuditLogs } from './auditService.js';
import { listSkills } from '../skills/skillService.js';
import { adminListRequests } from '../requests/requestService.js';
import { adminListSessions } from '../sessions/sessionService.js';
import { adminListReports, adminUpdateReport, getReport } from '../reports/reportService.js';
import { adminListReviews, adminRestoreReview, deleteReview } from '../reviews/reviewService.js';
import { deleteUser, getPublicProfile } from '../users/userService.js';
import * as points from '../points/pointsService.js';

const router = Router();
router.use(...requireAdmin);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const reasonSchema = z.string().transform(cleanText).pipe(z.string().min(3, 'Please provide a reason.').max(500));

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    res.json(await admin.dashboardStats());
  }),
);

// ---- users ----
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json(await admin.listUsers(req.query));
  }),
);

router.get(
  '/users/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ user: await getPublicProfile(req.user, req.params.id) });
  }),
);

router.patch(
  '/users/:id/status',
  validate(idParam, 'params'),
  validate(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: reasonSchema.optional() })),
  asyncHandler(async (req, res) => {
    res.json(await admin.setUserStatus(req.user, req.params.id, req.body.status, req.body.reason));
  }),
);

router.delete(
  '/users/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await deleteUser(req.user, req.params.id);
    res.json({ success: true });
  }),
);

// ---- skills (read view with inactive) ----
router.get(
  '/skills',
  asyncHandler(async (req, res) => {
    res.json(await listSkills(req.query, { includeInactive: true }));
  }),
);

// ---- exchanges & sessions ----
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    res.json(await adminListRequests(req.query));
  }),
);

router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    res.json(await adminListSessions(req.query));
  }),
);

// ---- reports ----
router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    res.json(await adminListReports(req.query));
  }),
);

router.get(
  '/reports/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ report: await getReport(req.params.id) });
  }),
);

router.patch(
  '/reports/:id',
  validate(idParam, 'params'),
  validate(
    z.object({
      status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
      adminResponse: z.string().transform(cleanText).pipe(z.string().max(1000)).optional(),
      suspendUser: z.boolean().optional(),
      removeContent: z.boolean().optional(),
      paymentAction: z.enum(['RELEASE', 'REFUND', 'SPLIT']).optional(),
      teacherPoints: z.coerce.number().int().min(0).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json({ report: await adminUpdateReport(req.user, req.params.id, req.body) });
  }),
);

// ---- reviews ----
router.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    res.json(await adminListReviews(req.query));
  }),
);

router.delete(
  '/reviews/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await deleteReview(req.user, req.params.id));
  }),
);

router.patch(
  '/reviews/:id/restore',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ review: await adminRestoreReview(req.user.id, req.params.id) });
  }),
);

// ---- points management ----
router.get(
  '/points/overview',
  asyncHandler(async (_req, res) => {
    const [overview, rates, bonuses, disputes] = await Promise.all([
      points.adminOverview(),
      points.listRates({ includeInactive: true }),
      points.listBonuses(),
      points.adminListDisputes(),
    ]);
    res.json({ overview, rates, bonuses, disputes });
  }),
);

router.get(
  '/points/transactions',
  asyncHandler(async (req, res) => {
    res.json(await points.adminListTransactions(req.query));
  }),
);

router.post(
  '/points/adjust',
  validate(
    z.object({
      userId: z.coerce.number().int().positive(),
      amount: z.coerce.number().int().refine((v) => v !== 0, 'Amount cannot be zero.').refine((v) => Math.abs(v) <= 1000, 'Amount must be between -1000 and 1000.'),
      reason: reasonSchema,
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await points.adminAdjust(req.user.id, req.body));
  }),
);

router.post(
  '/points/rates',
  validate(z.object({ durationMinutes: z.coerce.number().int().min(15).max(480), pointCost: z.coerce.number().int().min(0).max(500) })),
  asyncHandler(async (req, res) => {
    res.status(201).json({ rate: await points.createRate(req.user.id, req.body) });
  }),
);

router.patch(
  '/points/rates/:id',
  validate(idParam, 'params'),
  validate(z.object({ pointCost: z.coerce.number().int().min(0).max(500).optional(), active: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    res.json({ rate: await points.updateRate(req.user.id, req.params.id, req.body) });
  }),
);

router.patch(
  '/points/bonuses/:id',
  validate(idParam, 'params'),
  validate(
    z.object({
      points: z.coerce.number().int().min(0).max(500).optional(),
      active: z.boolean().optional(),
      description: z.string().transform(cleanText).pipe(z.string().max(300)).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json({ bonus: await points.updateBonus(req.user.id, req.params.id, req.body) });
  }),
);

router.post(
  '/points/disputes/:id/resolve',
  validate(idParam, 'params'),
  validate(
    z.object({
      action: z.enum(['RELEASE', 'REFUND', 'SPLIT']),
      teacherPoints: z.coerce.number().int().min(0).optional(),
      reason: reasonSchema,
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await withTransaction((client) => points.resolvePayment(client, req.user.id, req.params.id, req.body));
    res.json(result);
  }),
);

// ---- audit ----
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    res.json(await listAuditLogs(req.query));
  }),
);

export default router;
