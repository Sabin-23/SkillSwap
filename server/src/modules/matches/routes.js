import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/errors.js';
import { discoverUsers, matchWithUser } from './matchService.js';
import { getPublicProfile } from '../users/userService.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await discoverUsers(req.user.id, req.query, { requireMatch: true }));
  }),
);

router.get(
  '/:id',
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot match with yourself.');
    const [profile, match] = await Promise.all([
      getPublicProfile(req.user, req.params.id),
      matchWithUser(req.user.id, req.params.id),
    ]);
    res.json({ user: profile, match });
  }),
);

export default router;
