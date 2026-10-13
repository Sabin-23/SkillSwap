import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Configure the Nodemailer transporter if SMTP host is provided
const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port || 465,
      secure: env.smtp.port === 465, // true for port 465, false for 587
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    })
  : null;

/**
 * Minimal mail delivery abstraction.
 * Uses Nodemailer if configured, otherwise logs to the server console.
 */
async function deliver({ to, subject, text }) {
  if (env.isTest) return;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject,
        text,
      });
      return;
    } catch (error) {
      console.error('[mail] Failed to send email via SMTP:', error);
      throw error;
    }
  }

  // Fallback log when SMTP is not configured
  console.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n[mail] ${text}\n`);
}

export async function sendPasswordResetEmail(to, resetUrl) {
  await deliver({
    to,
    subject: 'Reset your SkillSwap password',
    text: `We received a request to reset your SkillSwap password.\n\nOpen this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  });
}
export async function sendOtpEmail(to, otp) {
  await deliver({
    to,
    subject: 'Your SkillSwap Login Verification Code',
    text: `Your one-time login verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not attempt to log in, please secure your account immediately.`,
  });
}

export const mailConfigured = Boolean(env.smtp.host);