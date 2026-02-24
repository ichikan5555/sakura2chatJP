-- Admin password (single row)
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  password_hash TEXT NOT NULL
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- IMAP Accounts (複数アカウント対応)
-- poll_speed: "high" (30s) | "normal" (60s) | "slow" (90s)
-- password_mode: "derive" | "manual"
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 993,
  username TEXT NOT NULL UNIQUE,
  password TEXT,
  password_mode TEXT NOT NULL DEFAULT 'manual' CHECK(password_mode IN ('derive', 'manual')),
  password_prefix TEXT,
  password_suffix TEXT,
  poll_speed TEXT NOT NULL DEFAULT 'normal' CHECK(poll_speed IN ('high', 'normal', 'slow')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rules
-- source: "imap" | "all"
-- account_id: NULL = all accounts, or specific account ID
-- conditions: JSON array of {field, operator, value}
--   field: "sender" | "subject" | "body"
--   operator: "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "matches" (regex) | "domain"
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'all' CHECK(source IN ('imap', 'all')),
  account_id INTEGER,
  match_type TEXT NOT NULL DEFAULT 'all' CHECK(match_type IN ('all', 'any')),
  conditions TEXT NOT NULL DEFAULT '[]',
  chatwork_room_id TEXT NOT NULL,
  message_template TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Processed emails (IMAP)
CREATE TABLE IF NOT EXISTS processed_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  imap_uid TEXT NOT NULL,
  rule_id INTEGER,
  sender TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  chatwork_room_id TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, imap_uid),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Poller state (per account)
CREATE TABLE IF NOT EXISTS poller_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE,
  last_uid INTEGER DEFAULT 0,
  last_poll_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
