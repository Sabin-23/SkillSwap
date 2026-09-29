import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/errors.js';
import { cleanText } from '../../utils/sanitize.js';
import { fullNameSchema } from '../auth/schemas.js';
import { discoverUsers } from '../matches/matchService.js';
import * as users from './userService.js';
import { listReviewsForUser } from '../reviews/reviewService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(ApiError.badRequest('Only image files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const idParam = z.object({ id: z.coerce.number().int().positive() });
const text = (max) => z.string().transform(cleanText).pipe(z.string().max(max, `Must be at most ${max} characters.`));

export const profileUpdateSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    bio: text(600).nullable().optional(),
    location: text(120).nullable().optional(),
    learningFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).nullable().optional(),
    isPublic: z.boolean().optional(),
    showPointsPublicly: z.boolean().optional(),
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .strict();

const userSkillSchema = z.object({
  skillId: z.coerce.number().int().positive({ message: 'Please select a skill.' }),
  type: z.enum(['TEACHES', 'WANTS_TO_LEARN'], { message: 'Skill type must be TEACHES or WANTS_TO_LEARN.' }),
});

function ensureSelfOrAdmin(req, id) {
  if (req.user.id !== id && req.user.role !== 'ADMIN') throw ApiError.forbidden();
}

// Discovery / search
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await discoverUsers(req.user.id, req.query));
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ user: await users.getPublicProfile(req.user, req.params.id) });
  }),
);

router.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    ensureSelfOrAdmin(req, req.params.id);
    res.json({ user: await users.updateProfile(req.params.id, req.body) });
  }),
);

router.delete(
  '/:id',
  validate(idParam, 'params'),
  validate(z.object({ password: z.string().optional() })),
  asyncHandler(async (req, res) => {
    ensureSelfOrAdmin(req, req.params.id);
    await users.deleteUser(req.user, req.params.id, req.body);
    res.json({ success: true });
  }),
);

// Avatar
router.post(
  '/:id/avatar',
  validate(idParam, 'params'),
  (req, res, next) => {
    ensureSelfOrAdmin(req, req.params.id);
    next();
  },
  upload.single('avatar'),
  asyncHandler(async (req, res) => {
    res.json(await users.updateAvatar(req.params.id, req.file));
  }),
);

router.delete(
  '/:id/avatar',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    ensureSelfOrAdmin(req, req.params.id);
    await users.deleteAvatar(req.params.id);
    res.json({ success: true });
  }),
);

// User skills
router.get(
  '/:id/skills',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ skills: await users.listUserSkills(req.params.id) });
  }),
);

router.post(
  '/:id/skills',
  validate(idParam, 'params'),
  validate(userSkillSchema),
  asyncHandler(async (req, res) => {
    ensureSelfOrAdmin(req, req.params.id);
    res.status(201).json({ skills: await users.addUserSkill(req.params.id, req.body) });
  }),
);

router.delete(
  '/:id/skills/:skillId',
  validate(z.object({ id: z.coerce.number().int().positive(), skillId: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (req, res) => {
    ensureSelfOrAdmin(req, req.params.id);
    const type = ['TEACHES', 'WANTS_TO_LEARN'].includes(req.query.type) ? req.query.type : undefined;
    res.json({ skills: await users.removeUserSkill(req.params.id, req.params.skillId, type) });
  }),
);

// Reviews about a user
router.get(
  '/:id/reviews',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await listReviewsForUser(req.params.id, req.query));
  }),
);

export default router;
