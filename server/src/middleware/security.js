import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for cookie-based sessions: browsers cannot add custom headers
 * on cross-site form submissions, so every state-changing request must carry
 * the `X-Requested-With: SkillSwap` header set by our client.
 * Combined with SameSite cookies this blocks cross-site request forgery.
 */
export function csrfGuard(req, _res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (req.headers['x-requested-with'] === 'SkillSwap') return next();
  next(ApiError.forbidden('Request blocked by cross-site protection.'));
}

function limiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, _res, next) => next(ApiError.tooMany()),
    ...options,
  });
}

/** Tight limit for credential endpoints to slow down brute-force attempts. */
export const authLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30 });

/** Generous global limit for the rest of the API. */
export const apiLimiter = limiter({ windowMs: 60 * 1000, limit: 300 });
