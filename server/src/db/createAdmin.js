/**
 * Create (or promote) an administrator account.
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='StrongPass123' ADMIN_NAME='Site Admin' npm run create-admin
 *   or: npm run create-admin -- admin@example.com 'StrongPass123' 'Site Admin'
 */
import { closePool, withTransaction } from './pool.js';
import { hashPassword } from '../modules/auth/authService.js';
import { ensureWallet } from '../modules/points/pointsService.js';

const [argEmail, argPassword, argName] = process.argv.slice(2);
const email = (process.env.ADMIN_EMAIL || argEmail || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || argPassword;
const fullName = process.env.ADMIN_NAME || argName || 'SkillSwap Administrator';

async function main() {
  if (!email || !password) {
    console.error('Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_NAME=...] npm run create-admin');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('Password must be at least 8 characters and contain a letter and a number.');
    process.exitCode = 1;
    return;
  }
  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows[0]) {
      await client.query(
        "UPDATE users SET role = 'ADMIN', status = 'ACTIVE', password_hash = $2, full_name = $3, updated_at = NOW() WHERE id = $1",
        [rows[0].id, passwordHash, fullName],
      );
      console.log(`Existing user ${email} promoted to ADMIN and password updated.`);
      return;
    }
    const inserted = await client.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN') RETURNING id",
      [fullName, email, passwordHash],
    );
    await client.query('INSERT INTO profiles (user_id, onboarding_completed, is_public) VALUES ($1, TRUE, FALSE)', [inserted.rows[0].id]);
    await ensureWallet(inserted.rows[0].id, client);
    console.log(`Administrator ${email} created.`);
  });
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
