import { Router } from 'express';
import { env } from '../../config/env.js';
import { AUTH_COOKIE, cookieOptions, requireAuth, signToken } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as auth from './authService.js';
import { getMe } from '../users/userService.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas.js';

const router = Router();

function issueSession(res, user) {
  res.cookie(AUTH_COOKIE, signToken(user), cookieOptions());
}

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await auth.register(req.body);
    issueSession(res, user);
    res.status(201).json({ user: await getMe(user.id) });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await auth.login(req.body);
    issueSession(res, user);
    res.json({ user: await getMe(user.id) });
  }),
);

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await getMe(req.user.id) });
  }),
);

router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { resetUrl } = await auth.requestPasswordReset(req.body.email);
    const body = { message: 'If an account exists for that email, a reset link has been sent.' };
    // In development the link is returned so the flow can be tested without an email server.
    if (!env.isProduction && resetUrl) body.resetUrl = resetUrl;
    res.json(body);
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body);
    res.json({ message: 'Your password has been reset. You can now sign in.' });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await auth.changePassword(req.user.id, req.body);
    res.json({ message: 'Password updated.' });
  }),
);

export default router;
