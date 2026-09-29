import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const AUTH_COOKIE = 'skillswap_token';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function extractToken(req) {
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Populate `req.user` when a valid token is present. Does not fail when absent,
 * so public endpoints can personalise responses for signed-in visitors.
 */
export const attachUser = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next();
  }
  const { rows } = await query(
    'SELECT id, full_name, email, role, status FROM users WHERE id = $1',
    [payload.sub],
  );
  const user = rows[0];
  if (user && user.status === 'ACTIVE') {
    req.user = user;
  } else if (user) {
    req.suspendedUser = user;
  }
  next();
});

export function requireAuth(req, _res, next) {
  if (req.user) return next();
  if (req.suspendedUser) {
    return next(ApiError.forbidden('Your account has been suspended. Please contact support.'));
  }
  next(ApiError.unauthorized());
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

export const requireAdmin = [requireAuth, requireRole('ADMIN')];
