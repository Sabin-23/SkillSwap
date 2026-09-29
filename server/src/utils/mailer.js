import { env } from '../config/env.js';

/**
 * Minimal mail delivery abstraction.
 * No SMTP transport is bundled; when SMTP is not configured the message is
 * written to the server log so the flow can be exercised in development.
 * Plug a real transport (e.g. nodemailer) into `deliver` for production.
 */
async function deliver({ to, subject, text }) {
  if (env.isTest) return;
  console.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n[mail] ${text}\n`);
}

export async function sendPasswordResetEmail(to, resetUrl) {
  await deliver({
    to,
    subject: 'Reset your SkillSwap password',
    text: `We received a request to reset your SkillSwap password.\n\nOpen this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  });
}

export const mailConfigured = Boolean(env.smtp.host);
