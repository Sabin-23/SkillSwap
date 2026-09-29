import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as reviews from './reviewService.js';

const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const ratingSchema = z.coerce.number().int().min(1, 'Rating must be between 1 and 5.').max(5, 'Rating must be between 1 and 5.');
const commentSchema = z.string().transform(cleanText).pipe(z.string().max(1000, 'Comment must be at most 1000 characters.'));

const createSchema = z.object({
  exchangeRequestId: z.coerce.number().int().positive(),
  rating: ratingSchema,
  comment: commentSchema.optional(),
});
const updateSchema = z.object({ rating: ratingSchema.optional(), comment: commentSchema.optional() });

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const [received, given] = await Promise.all([
      reviews.listReviewsForUser(req.user.id, req.query),
      reviews.listReviewsByUser(req.user.id, req.query),
    ]);
    res.json({ received, given });
  }),
);

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ review: await reviews.createReview(req.user, req.body) });
  }),
);

router.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    res.json({ review: await reviews.updateReview(req.user, req.params.id, req.body) });
  }),
);

router.delete(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await reviews.deleteReview(req.user, req.params.id));
  }),
);

export default router;
