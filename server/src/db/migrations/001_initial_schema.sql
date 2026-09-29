-- ============================================================
-- SkillSwap initial schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Users & profiles ----------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  status        VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_full_name ON users (LOWER(full_name));

CREATE TABLE profiles (
  user_id               INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  bio                   TEXT,
  location              VARCHAR(120),
  avatar_url            TEXT,
  learning_format       VARCHAR(10) CHECK (learning_format IN ('ONLINE', 'IN_PERSON', 'EITHER')),
  is_public             BOOLEAN NOT NULL DEFAULT TRUE,
  show_points_publicly  BOOLEAN NOT NULL DEFAULT FALSE,
  notify_in_app         BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email          BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_profiles_location ON profiles (LOWER(location));
CREATE INDEX idx_profiles_format ON profiles (learning_format);

CREATE TABLE password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);

-- ---------- Skills ----------
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE skills (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_skills_name_unique ON skills (LOWER(name));
CREATE INDEX idx_skills_category ON skills (category_id);
CREATE INDEX idx_skills_status ON skills (status);

CREATE TABLE user_skills (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id   INTEGER NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  type       VARCHAR(15) NOT NULL CHECK (type IN ('TEACHES', 'WANTS_TO_LEARN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skill_id, type)
);
CREATE INDEX idx_user_skills_user ON user_skills (user_id, type);
CREATE INDEX idx_user_skills_skill ON user_skills (skill_id, type);

-- ---------- Exchange requests ----------
-- The sender is the learner; the receiver is the teacher of `skill_id`.
CREATE TABLE exchange_requests (
  id               SERIAL PRIMARY KEY,
  sender_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  receiver_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id         INTEGER NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  message          TEXT,
  duration_minutes INTEGER NOT NULL,
  point_cost       INTEGER NOT NULL CHECK (point_cost >= 0),
  status           VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> receiver_id)
);
CREATE INDEX idx_requests_sender ON exchange_requests (sender_id, status);
CREATE INDEX idx_requests_receiver ON exchange_requests (receiver_id, status);
CREATE INDEX idx_requests_status ON exchange_requests (status);
CREATE INDEX idx_requests_skill ON exchange_requests (skill_id);
-- Only one active (pending/accepted) request per learner+teacher+skill
CREATE UNIQUE INDEX idx_requests_unique_active
  ON exchange_requests (sender_id, receiver_id, skill_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

-- ---------- Sessions ----------
CREATE TABLE sessions (
  id                  SERIAL PRIMARY KEY,
  exchange_request_id INTEGER NOT NULL REFERENCES exchange_requests (id) ON DELETE CASCADE,
  host_id             INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  participant_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id            INTEGER NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  scheduled_date      DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  format              VARCHAR(10) NOT NULL CHECK (format IN ('ONLINE', 'IN_PERSON')),
  location            TEXT,
  meeting_link        TEXT,
  notes               TEXT,
  status              VARCHAR(10) NOT NULL DEFAULT 'SCHEDULED'
                      CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX idx_sessions_request ON sessions (exchange_request_id);
CREATE INDEX idx_sessions_host ON sessions (host_id, status);
CREATE INDEX idx_sessions_participant ON sessions (participant_id, status);
CREATE INDEX idx_sessions_date ON sessions (scheduled_date, start_time);
CREATE INDEX idx_sessions_status ON sessions (status);
-- One scheduled session per exchange at a time
CREATE UNIQUE INDEX idx_sessions_one_scheduled
  ON sessions (exchange_request_id) WHERE status = 'SCHEDULED';

-- ---------- Messaging ----------
CREATE TABLE conversations (
  id              SERIAL PRIMARY KEY,
  user_one_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_two_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_one_id < user_two_id),
  UNIQUE (user_one_id, user_two_id)
);
CREATE INDEX idx_conversations_user_one ON conversations (user_one_id, last_message_at DESC);
CREATE INDEX idx_conversations_user_two ON conversations (user_two_id, last_message_at DESC);

CREATE TABLE messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  receiver_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_receiver_unread ON messages (receiver_id) WHERE is_read = FALSE;

-- ---------- Reviews ----------
CREATE TABLE reviews (
  id                  SERIAL PRIMARY KEY,
  exchange_request_id INTEGER NOT NULL REFERENCES exchange_requests (id) ON DELETE CASCADE,
  reviewer_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewed_user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             TEXT,
  status              VARCHAR(10) NOT NULL DEFAULT 'VISIBLE' CHECK (status IN ('VISIBLE', 'REMOVED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_request_id, reviewer_id)
);
CREATE INDEX idx_reviews_reviewed ON reviews (reviewed_user_id, status);
CREATE INDEX idx_reviews_reviewer ON reviews (reviewer_id);

-- ---------- Notifications ----------
CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL,
  title      VARCHAR(160) NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- ---------- Reports ----------
CREATE TABLE reports (
  id               SERIAL PRIMARY KEY,
  reporter_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reported_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  target_type      VARCHAR(10) NOT NULL CHECK (target_type IN ('USER', 'MESSAGE', 'REVIEW', 'SESSION', 'CONTENT')),
  target_id        INTEGER,
  reason           VARCHAR(40) NOT NULL,
  description      TEXT NOT NULL,
  status           VARCHAR(15) NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')),
  admin_response   TEXT,
  resolved_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX idx_reports_reported_user ON reports (reported_user_id);

-- ---------- Audit log ----------
CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ---------- SkillSwap Points ----------
CREATE TABLE wallets (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  available_balance INTEGER NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE point_transactions (
  id               SERIAL PRIMARY KEY,
  wallet_id        INTEGER NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL,
  transaction_type VARCHAR(20) NOT NULL
                   CHECK (transaction_type IN ('SESSION_REWARD', 'SESSION_PAYMENT', 'RESERVATION', 'BONUS', 'ADMIN_ADJUSTMENT', 'REFUND', 'PENALTY')),
  description      TEXT NOT NULL,
  reference_type   VARCHAR(30),
  reference_id     VARCHAR(80),
  balance_after    INTEGER NOT NULL,
  created_by       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_point_tx_user ON point_transactions (user_id, created_at DESC);
CREATE INDEX idx_point_tx_type ON point_transactions (transaction_type);
-- A bonus with a given reference can be granted to a user only once
CREATE UNIQUE INDEX idx_point_tx_unique_bonus
  ON point_transactions (user_id, reference_type, reference_id)
  WHERE transaction_type = 'BONUS';
-- A session payment / reward / refund for one exchange can be recorded only once per user
CREATE UNIQUE INDEX idx_point_tx_unique_settlement
  ON point_transactions (user_id, transaction_type, reference_type, reference_id)
  WHERE transaction_type IN ('SESSION_PAYMENT', 'SESSION_REWARD', 'REFUND', 'RESERVATION');

CREATE TABLE session_point_rates (
  id               SERIAL PRIMARY KEY,
  duration_minutes INTEGER NOT NULL UNIQUE CHECK (duration_minutes > 0),
  point_cost       INTEGER NOT NULL CHECK (point_cost >= 0),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE point_bonuses (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  points      INTEGER NOT NULL CHECK (points >= 0),
  condition   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_payments (
  id                  SERIAL PRIMARY KEY,
  exchange_request_id INTEGER NOT NULL UNIQUE REFERENCES exchange_requests (id) ON DELETE CASCADE,
  session_id          INTEGER REFERENCES sessions (id) ON DELETE SET NULL,
  learner_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  teacher_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points              INTEGER NOT NULL CHECK (points >= 0),
  status              VARCHAR(12) NOT NULL DEFAULT 'RESERVED'
                      CHECK (status IN ('RESERVED', 'COMPLETED', 'REFUNDED', 'DISPUTED', 'SPLIT')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX idx_session_payments_status ON session_payments (status);
CREATE INDEX idx_session_payments_learner ON session_payments (learner_id);
CREATE INDEX idx_session_payments_teacher ON session_payments (teacher_id);
