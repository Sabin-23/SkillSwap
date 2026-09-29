import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as requests from './requestService.js';

const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const quoteSchema = z.object({
  receiverId: z.coerce.number().int().positive({ message: 'Please choose a skill partner.' }),
  skillId: z.coerce.number().int().positive({ message: 'Please select a skill.' }),
  durationMinutes: z.coerce.number().int().positive({ message: 'Please select a session duration.' }),
});

const createSchema = quoteSchema.extend({
  message: z.string().transform(cleanText).pipe(z.string().max(1000, 'Message must be at most 1000 characters.')).optional(),
});

router.get(
  '/counts',
  asyncHandler(async (req, res) => {
    res.json(await requests.requestCounts(req.user.id));
  }),
);

router.get(
  '/sent',
  asyncHandler(async (req, res) => {
    res.json(await requests.listRequests(req.user.id, 'sent', req.query));
  }),
);

router.get(
  '/received',
  asyncHandler(async (req, res) => {
    res.json(await requests.listRequests(req.user.id, 'received', req.query));
  }),
);

router.get(
  '/completed',
  asyncHandler(async (req, res) => {
    res.json(await requests.listRequests(req.user.id, 'completed', req.query));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await requests.listRequests(req.user.id, 'all', req.query));
  }),
);

router.post(
  '/quote',
  validate(quoteSchema),
  asyncHandler(async (req, res) => {
    res.json(await requests.quoteRequest(req.user.id, req.body));
  }),
);

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ request: await requests.createRequest(req.user, req.body) });
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ request: await requests.getRequest(req.params.id, req.user) });
  }),
);

router.patch(
  '/:id/accept',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ request: await requests.acceptRequest(req.user, req.params.id) });
  }),
);

router.patch(
  '/:id/reject',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ request: await requests.rejectRequest(req.user, req.params.id) });
  }),
);

router.patch(
  '/:id/cancel',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ request: await requests.cancelRequest(req.user, req.params.id) });
  }),
);

export default router;
