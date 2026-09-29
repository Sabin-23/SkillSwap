import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as sessions from './sessionService.js';

const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time (HH:MM).');
const urlSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().max(500).url('Enter a valid meeting link (https://...).').refine((v) => v.startsWith('https://') || v.startsWith('http://'), 'Meeting link must start with http:// or https://'));

const baseSessionSchema = z.object({
  scheduledDate: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  format: z.enum(['ONLINE', 'IN_PERSON'], { message: 'Choose a session format.' }),
  location: z.string().transform(cleanText).pipe(z.string().max(300)).nullable().optional(),
  meetingLink: z.union([urlSchema, z.literal(''), z.null()]).optional(),
  notes: z.string().transform(cleanText).pipe(z.string().max(1000)).nullable().optional(),
});

const createSchema = baseSessionSchema
  .extend({ exchangeRequestId: z.coerce.number().int().positive() })
  .refine((data) => data.endTime > data.startTime, { message: 'End time must be after start time.', path: ['endTime'] });

const updateSchema = baseSessionSchema.partial();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await sessions.listSessions(req.user.id, req.query));
  }),
);

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ session: await sessions.createSession(req.user, req.body) });
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ session: await sessions.getSession(req.params.id, req.user) });
  }),
);

router.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    res.json({ session: await sessions.updateSession(req.user, req.params.id, req.body) });
  }),
);

router.patch(
  '/:id/cancel',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ session: await sessions.cancelSession(req.user, req.params.id) });
  }),
);

router.delete(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ session: await sessions.cancelSession(req.user, req.params.id) });
  }),
);

router.patch(
  '/:id/complete',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ session: await sessions.completeSession(req.user, req.params.id) });
  }),
);

export default router;
