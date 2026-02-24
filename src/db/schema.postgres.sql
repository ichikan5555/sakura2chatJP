-- PostgreSQL Schema for sakura2chat

-- Admin password (single row)
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  password_hash TEXT NOT NULL
);

-- Users table (for multi-user support)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_type TEXT NOT NULL DEFAULT 'admin' CHECK(user_type IN ('admin', 'user')),
  user_id INTEGER,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- IMAP Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 993,
  username TEXT NOT NULL UNIQUE,
  password TEXT,
  password_mode TEXT NOT NULL DEFAULT 'manual' CHECK(password_mode IN ('derive', 'manual')),
  password_prefix TEXT,
  password_suffix TEXT,
  poll_speed TEXT NOT NULL DEFAULT 'normal' CHECK(poll_speed IN ('high', 'normal')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Rules
CREATE TABLE IF NOT EXISTS rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'all' CHECK(source IN ('imap', 'all')),
  account_id INTEGER,
  match_type TEXT NOT NULL DEFAULT 'all' CHECK(match_type IN ('all', 'any')),
  conditions TEXT NOT NULL DEFAULT '[]',
  chatwork_room_id TEXT NOT NULL,
  message_template TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Processed emails (IMAP)
CREATE TABLE IF NOT EXISTS processed_emails (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  imap_uid TEXT NOT NULL,
  rule_id INTEGER,
  sender TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  chatwork_room_id TEXT,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, imap_uid),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Poller state (per account)
CREATE TABLE IF NOT EXISTS poller_state (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE,
  last_uid INTEGER DEFAULT 0,
  last_poll_at TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_user_id ON rules(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_type ON sessions(user_type);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
