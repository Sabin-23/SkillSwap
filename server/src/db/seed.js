/**
 * DEVELOPMENT / DEMO SEED DATA
 * ----------------------------
 * Populates the database with sample users, skills relationships, exchange
 * requests, sessions, messages, reviews and point activity so the platform
 * can be explored locally. All accounts use the password "Password123".
 *
 * This script refuses to run when NODE_ENV=production unless --force is passed.
 */
import { env } from '../config/env.js';
import { closePool, query, withTransaction } from './pool.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from '../modules/auth/authService.js';
import { ensureWallet, grantBonus } from '../modules/points/pointsService.js';
import { createRequest, acceptRequest, rejectRequest, cancelRequest } from '../modules/requests/requestService.js';
import { completeSession } from '../modules/sessions/sessionService.js';
import { openConversation, sendMessage, markConversationRead } from '../modules/messages/messageService.js';
import { createReview } from '../modules/reviews/reviewService.js';
import { createReport } from '../modules/reports/reportService.js';

const DEMO_PASSWORD = 'Password123';

const DEMO_USERS = [
  {
    key: 'admin',
    fullName: 'SkillSwap Admin',
    email: 'admin@skillswap.dev',
    role: 'ADMIN',
    bio: 'Platform administrator (demo account).',
    location: 'Kigali',
    format: 'EITHER',
    isPublic: false,
  },
  {
    key: 'amina',
    fullName: 'Amina Uwase',
    email: 'amina@skillswap.dev',
    bio: 'Brand designer with 6 years of experience. I love helping people make their ideas look great, and I am learning to code my own portfolio.',
    location: 'Kigali',
    format: 'EITHER',
    teaches: ['Graphic Design', 'Photography'],
    learns: ['JavaScript', 'English'],
  },
  {
    key: 'david',
    fullName: 'David Mugisha',
    email: 'david@skillswap.dev',
    bio: 'Full-stack developer. Happy to teach JavaScript fundamentals and modern web development. Trying to improve my design eye.',
    location: 'Kigali',
    format: 'ONLINE',
    teaches: ['JavaScript', 'Web Development'],
    learns: ['Graphic Design', 'French'],
  },
  {
    key: 'grace',
    fullName: 'Grace Wanjiru',
    email: 'grace@skillswap.dev',
    bio: 'Language teacher and travel lover. Conversational French and English lessons tailored to your goals.',
    location: 'Nairobi',
    format: 'EITHER',
    teaches: ['French', 'English'],
    learns: ['Photography', 'Cooking'],
  },
  {
    key: 'samuel',
    fullName: 'Samuel Okafor',
    email: 'samuel@skillswap.dev',
    bio: 'Home cook and guitarist. I can teach you West African dishes or your first chords.',
    location: 'Lagos',
    format: 'IN_PERSON',
    teaches: ['Cooking', 'Music'],
    learns: ['Web Development', 'Marketing'],
  },
  {
    key: 'lena',
    fullName: 'Lena Fischer',
    email: 'lena@skillswap.dev',
    bio: 'Marketing lead at a startup. I coach public speaking for introverts and want to learn Python for data work.',
    location: 'Berlin',
    format: 'ONLINE',
    teaches: ['Marketing', 'Public Speaking'],
    learns: ['Python', 'Music'],
  },
  {
    key: 'kwame',
    fullName: 'Kwame Mensah',
    email: 'kwame@skillswap.dev',
    bio: 'Data analyst and part-time maths tutor. Patient teacher, curious learner.',
    location: 'Accra',
    format: 'EITHER',
    teaches: ['Python', 'Data Analysis', 'Mathematics'],
    learns: ['Public Speaking', 'Spanish'],
  },
  {
    key: 'sofia',
    fullName: 'Sofia Martínez',
    email: 'sofia@skillswap.dev',
    bio: 'Illustrator from Madrid. Native Spanish speaker, happy to chat and correct your grammar.',
    location: 'Madrid',
    format: 'ONLINE',
    teaches: ['Spanish', 'Drawing'],
    learns: ['Data Analysis', 'Fitness'],
  },
  {
    key: 'joseph',
    fullName: 'Joseph Habimana',
    email: 'joseph@skillswap.dev',
    bio: 'Personal trainer in Kigali. Teaching Kinyarwanda to newcomers is my favourite way to make friends.',
    location: 'Kigali',
    format: 'IN_PERSON',
    teaches: ['Kinyarwanda', 'Fitness'],
    learns: ['Graphic Design', 'Programming'],
  },
];

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function skillId(name) {
  const { rows } = await query('SELECT id FROM skills WHERE LOWER(name) = LOWER($1)', [name]);
  if (!rows[0]) throw new Error(`Seed skill missing: ${name}`);
  return rows[0].id;
}

async function insertPastSession(requestId, { daysAgo, format = 'ONLINE', meetingLink = null, location = null }) {
  const { rows } = await query(
    `INSERT INTO sessions (exchange_request_id, host_id, participant_id, skill_id, scheduled_date, start_time, end_time, format, meeting_link, location)
     SELECT er.id, er.receiver_id, er.sender_id, er.skill_id, $2::date, '10:00', '11:00', $3, $4, $5
     FROM exchange_requests er WHERE er.id = $1 RETURNING id`,
    [requestId, daysFromNow(-daysAgo), format, meetingLink, location],
  );
  return rows[0].id;
}

async function insertFutureSession(requestId, { daysAhead, format = 'ONLINE', meetingLink = null, location = null }) {
  const { rows } = await query(
    `INSERT INTO sessions (exchange_request_id, host_id, participant_id, skill_id, scheduled_date, start_time, end_time, format, meeting_link, location)
     SELECT er.id, er.receiver_id, er.sender_id, er.skill_id, $2::date, '15:00', '16:00', $3, $4, $5
     FROM exchange_requests er WHERE er.id = $1 RETURNING id`,
    [requestId, daysFromNow(daysAhead), format, meetingLink, location],
  );
  return rows[0].id;
}

export async function seed({ log = console.log } = {}) {
  await runMigrations({ log });

  const existing = await query("SELECT COUNT(*)::int AS count FROM users WHERE email LIKE '%@skillswap.dev'");
  if (existing.rows[0].count > 0) {
    log('Demo data already present; skipping. Run `npm run migrate:reset && npm run seed` to start fresh.');
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = {};

  for (const demo of DEMO_USERS) {
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, role, status`,
        [demo.fullName, demo.email, passwordHash, demo.role ?? 'USER'],
      );
      const created = rows[0];
      await client.query(
        `INSERT INTO profiles (user_id, bio, location, learning_format, is_public, onboarding_completed)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [created.id, demo.bio, demo.location, demo.format, demo.isPublic ?? true],
      );
      await ensureWallet(created.id, client);
      if (created.role === 'USER') await grantBonus(created.id, 'WELCOME', client);
      return created;
    });
    for (const name of demo.teaches ?? []) {
      await query("INSERT INTO user_skills (user_id, skill_id, type) VALUES ($1, $2, 'TEACHES')", [user.id, await skillId(name)]);
    }
    for (const name of demo.learns ?? []) {
      await query("INSERT INTO user_skills (user_id, skill_id, type) VALUES ($1, $2, 'WANTS_TO_LEARN')", [user.id, await skillId(name)]);
    }
    users[demo.key] = user;
    log(`Created ${demo.role ?? 'USER'} ${demo.email}`);
  }

  const { amina, david, grace, samuel, lena, kwame, sofia, joseph } = users;

  // 1. Amina learns JavaScript from David: completed exchange with reviews both ways.
  const r1 = await createRequest(amina, {
    receiverId: david.id,
    skillId: await skillId('JavaScript'),
    durationMinutes: 60,
    message: 'Hi David! I would love an intro to JavaScript so I can build my portfolio site. I can teach you Graphic Design in return.',
  });
  await acceptRequest(david, r1.id);
  const s1 = await insertPastSession(r1.id, { daysAgo: 6, meetingLink: 'https://meet.example.com/skillswap-js-intro' });
  await completeSession(david, s1);
  await createReview(amina, { exchangeRequestId: r1.id, rating: 5, comment: 'David explained closures in a way that finally made sense. Patient and well prepared!' });
  await createReview(david, { exchangeRequestId: r1.id, rating: 5, comment: 'Amina came with clear goals and great questions. Looking forward to our design session.' });

  // 2. David learns Graphic Design from Amina: accepted with an upcoming session.
  const r2 = await createRequest(david, {
    receiverId: amina.id,
    skillId: await skillId('Graphic Design'),
    durationMinutes: 60,
    message: 'Your turn to teach me! Could we start with typography and layout basics?',
  });
  await acceptRequest(amina, r2.id);
  await insertFutureSession(r2.id, { daysAhead: 3, meetingLink: 'https://meet.example.com/skillswap-design-101' });

  // 3. Grace wants Photography from Amina: pending.
  await createRequest(grace, {
    receiverId: amina.id,
    skillId: await skillId('Photography'),
    durationMinutes: 90,
    message: 'Hello Amina, I travel a lot and my photos never look the way I want. Could you help with composition and light?',
  });

  // 4. Samuel wants Web Development from David: rejected.
  const r4 = await createRequest(samuel, {
    receiverId: david.id,
    skillId: await skillId('Web Development'),
    durationMinutes: 60,
    message: 'I want to build a website for my cooking classes.',
  });
  await rejectRequest(david, r4.id);

  // 5. Lena learns Python from Kwame: completed, one review.
  const r5 = await createRequest(lena, {
    receiverId: kwame.id,
    skillId: await skillId('Python'),
    durationMinutes: 60,
    message: 'Looking to automate some marketing reports with Python. Complete beginner!',
  });
  await acceptRequest(kwame, r5.id);
  const s5 = await insertPastSession(r5.id, { daysAgo: 2, meetingLink: 'https://meet.example.com/skillswap-python' });
  await completeSession(kwame, s5);
  await createReview(lena, { exchangeRequestId: r5.id, rating: 4, comment: 'Great first session. We went a little over time but I learned a lot about pandas.' });

  // 6. Amina wants English from Grace: pending.
  await createRequest(amina, {
    receiverId: grace.id,
    skillId: await skillId('English'),
    durationMinutes: 30,
    message: 'I would like to practise presenting my design work in English.',
  });

  // 7. Joseph wanted Graphic Design from Amina but cancelled.
  const r7 = await createRequest(joseph, {
    receiverId: amina.id,
    skillId: await skillId('Graphic Design'),
    durationMinutes: 60,
    message: 'Could you help me design flyers for my gym?',
  });
  await cancelRequest(joseph, r7.id);

  // 8. Sofia wants Data Analysis from Kwame: pending.
  await createRequest(sofia, {
    receiverId: kwame.id,
    skillId: await skillId('Data Analysis'),
    durationMinutes: 60,
    message: 'I want to understand my shop sales data better. Spanish lessons in exchange?',
  });

  // Conversations
  const c1 = await openConversation(amina, david.id);
  await sendMessage(amina, c1.id, 'Thanks again for the JavaScript session, David!');
  await sendMessage(david, c1.id, 'Any time! Did the portfolio deploy work?');
  await sendMessage(amina, c1.id, 'It did! Ready for our design session on Thursday?');
  await markConversationRead(david.id, c1.id);
  const c2 = await openConversation(lena, kwame.id);
  await sendMessage(lena, c2.id, 'Hi Kwame, I finished the pandas exercises. Could we do a second session?');

  // Report (open) for the admin queue.
  await createReport(joseph, {
    targetType: 'USER',
    reportedUserId: samuel.id,
    reason: 'SPAM',
    description: 'This user sent me several unsolicited promotional messages about paid cooking classes outside the platform.',
  });

  log('\nDemo data created. Sign in with any demo account using password "Password123":');
  for (const demo of DEMO_USERS) log(`  ${demo.role === 'ADMIN' ? '[ADMIN]' : '[USER] '} ${demo.email}`);
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isDirectRun) {
  const force = process.argv.includes('--force');
  if (env.isProduction && !force) {
    console.error('Refusing to seed demo data in production. Pass --force if you really mean it.');
    process.exit(1);
  }
  seed()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
