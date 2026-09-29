import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as notifications from './notificationService.js';

const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [result, unread] = await Promise.all([
      notifications.listNotifications(req.user.id, req.query),
      notifications.unreadCount(req.user.id),
    ]);
    res.json({ ...result, unreadCount: unread });
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ unreadCount: await notifications.unreadCount(req.user.id) });
  }),
);

router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    res.json(await notifications.markAllRead(req.user.id));
  }),
);

router.patch(
  '/:id/read',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await notifications.markRead(req.user.id, req.params.id));
  }),
);

export default router;
