import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { attachUser } from './middleware/auth.js';
import { apiLimiter, csrfGuard } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import { categoriesRouter, skillsRouter } from './modules/skills/routes.js';
import matchRoutes from './modules/matches/routes.js';
import requestRoutes from './modules/requests/routes.js';
import sessionRoutes from './modules/sessions/routes.js';
import messageRoutes from './modules/messages/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import reviewRoutes from './modules/reviews/routes.js';
import reportRoutes from './modules/reports/routes.js';
import pointsRoutes from './modules/points/routes.js';
import adminRoutes from './modules/admin/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Uploaded avatars are public assets; the uploads folder never contains anything else.
  app.use('/uploads', express.static(env.uploadDir, { fallthrough: true, index: false, dotfiles: 'deny', maxAge: '7d' }));

  const api = express.Router();
  api.use(apiLimiter);
  api.use(csrfGuard);
  api.use(attachUser);

  api.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  api.use('/auth', authRoutes);
  api.use('/users', userRoutes);
  api.use('/profiles', userRoutes);
  api.use('/skills', skillsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/matches', matchRoutes);
  api.use('/requests', requestRoutes);
  api.use('/sessions', sessionRoutes);
  api.use('/conversations', messageRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/reviews', reviewRoutes);
  api.use('/reports', reportRoutes);
  api.use('/points', pointsRoutes);
  api.use('/admin', adminRoutes);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
