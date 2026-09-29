import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cleanText } from '../../utils/sanitize.js';
import * as skills from './skillService.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

const skillSchema = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(2, 'Skill name must be at least 2 characters.').max(100)),
  description: z.string().transform(cleanText).pipe(z.string().max(500)).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const categorySchema = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(2, 'Category name must be at least 2 characters.').max(80)),
  description: z.string().transform(cleanText).pipe(z.string().max(300)).nullable().optional(),
});

export const skillsRouter = Router();

// Skills are public reference data (read), admin-managed (write).
skillsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    res.json(await skills.listSkills(req.query, { includeInactive }));
  }),
);

skillsRouter.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ skill: await skills.getSkill(req.params.id) });
  }),
);

skillsRouter.post(
  '/',
  ...requireAdmin,
  validate(skillSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ skill: await skills.createSkill(req.user.id, req.body) });
  }),
);

skillsRouter.patch(
  '/:id',
  ...requireAdmin,
  validate(idParam, 'params'),
  validate(skillSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json({ skill: await skills.updateSkill(req.user.id, req.params.id, req.body) });
  }),
);

skillsRouter.delete(
  '/:id',
  ...requireAdmin,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await skills.deleteSkill(req.user.id, req.params.id));
  }),
);

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await skills.listCategories() });
  }),
);

categoriesRouter.post(
  '/',
  ...requireAdmin,
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ category: await skills.createCategory(req.user.id, req.body) });
  }),
);

categoriesRouter.patch(
  '/:id',
  ...requireAdmin,
  validate(idParam, 'params'),
  validate(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    res.json({ category: await skills.updateCategory(req.user.id, req.params.id, req.body) });
  }),
);

categoriesRouter.delete(
  '/:id',
  ...requireAdmin,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await skills.deleteCategory(req.user.id, req.params.id);
    res.json({ success: true });
  }),
);
