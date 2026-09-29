import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as reports from './reportService.js';

const router = Router();
router.use(requireAuth);

export const createReportSchema = z.object({
  targetType: z.enum(['USER', 'MESSAGE', 'REVIEW', 'SESSION', 'CONTENT'], { message: 'Choose what you are reporting.' }),
  targetId: z.coerce.number().int().positive().optional(),
  reportedUserId: z.coerce.number().int().positive().optional(),
  reason: z.enum(reports.REPORT_REASONS, { message: 'Please choose a reason.' }),
  description: z
    .string({ required_error: 'Please describe the problem.' })
    .transform(cleanText)
    .pipe(z.string().min(10, 'Please describe the problem in at least 10 characters.').max(2000)),
});

router.post(
  '/',
  validate(createReportSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ report: await reports.createReport(req.user, req.body) });
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json({ items: await reports.listMyReports(req.user.id) });
  }),
);

router.get('/reasons', (_req, res) => {
  res.json({ items: reports.REPORT_REASONS });
});

export default router;
