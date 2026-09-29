import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as messages from './messageService.js';

const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const messageSchema = z.object({
  content: z
    .string({ required_error: 'Message cannot be empty.' })
    .transform(cleanText)
    .pipe(z.string().min(1, 'Message cannot be empty.').max(2000, 'Message must be at most 2000 characters.')),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await messages.listConversations(req.user.id, req.query) });
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ unreadCount: await messages.unreadMessageCount(req.user.id) });
  }),
);

router.post(
  '/',
  validate(z.object({ userId: z.coerce.number().int().positive() })),
  asyncHandler(async (req, res) => {
    res.status(201).json({ conversation: await messages.openConversation(req.user, req.body.userId) });
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ conversation: await messages.getConversation(req.user.id, req.params.id) });
  }),
);

router.get(
  '/:id/messages',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await messages.listMessages(req.user.id, req.params.id, req.query));
  }),
);

router.post(
  '/:id/messages',
  validate(idParam, 'params'),
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ message: await messages.sendMessage(req.user, req.params.id, req.body.content) });
  }),
);

router.patch(
  '/:id/read',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await messages.markConversationRead(req.user.id, req.params.id));
  }),
);

router.delete(
  '/:id/messages/:messageId',
  validate(z.object({ id: z.coerce.number().int().positive(), messageId: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (req, res) => {
    res.json({ message: await messages.deleteMessage(req.user.id, req.params.id, req.params.messageId) });
  }),
);

export default router;
