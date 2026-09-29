import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';

fs.mkdirSync(path.join(env.uploadDir, 'avatars'), { recursive: true });

const app = createApp();

pool
  .query('SELECT 1')
  .then(() => {
    app.listen(env.port, () => {
      console.log(`SkillSwap API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to PostgreSQL. Check DATABASE_URL.', err.message);
    process.exit(1);
  });
