import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Load the repository-level .env first, then a server-local .env if present.
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config({ path: path.resolve(here, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtSecret = process.env.JWT_SECRET || (nodeEnv === 'production' ? '' : 'dev-only-insecure-secret');
if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set in production');
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest,
  port: Number(process.env.PORT || 4710),
  databaseUrl: isTest
    ? required('TEST_DATABASE_URL', 'postgresql://skillswap:skillswap@localhost:5432/skillswap_test')
    : required('DATABASE_URL', 'postgresql://skillswap:skillswap@localhost:5432/skillswap'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  uploadDir: path.resolve(here, '../../', process.env.UPLOAD_DIR || './uploads'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_SIZE_MB || 2) * 1024 * 1024,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 0),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'SkillSwap <no-reply@skillswap.local>',
  },
};
