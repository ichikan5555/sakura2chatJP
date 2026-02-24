import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';

let db = null;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(config.db.path);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    logger.info(`SQLite database opened: ${config.db.path}`);
  }
  return db;
}

// ==================== Admin Auth ====================

export function verifyAdminPassword(password) {
  const row = getDb().prepare('SELECT password_hash FROM admin WHERE id = 1').get();
  if (!row) return false;
  const [salt, stored] = row.password_hash.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === stored;
}

export function changeAdminPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  getDb().prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(`${salt}:${hash}`);
}

// ==================== Users ====================

export function getAllUsers() {
  return getDb().prepare('SELECT id, username, email, display_name, enabled, created_at, updated_at FROM users ORDER BY id ASC').all();
}

export function getUserById(id) {
  return getDb().prepare('SELECT id, username, email, display_name, enabled, created_at, updated_at FROM users WHERE id = ?').get(id);
}

export function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function createUser({ username, password, email = null, display_name = null, enabled = 1 }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const result = getDb().prepare(
    `INSERT INTO users (username, email, password_hash, display_name, enabled)
     VALUES (?, ?, ?, ?, ?)`
  ).run(username, email, `${salt}:${hash}`, display_name, enabled);
  return getUserById(Number(result.lastInsertRowid));
}

export function updateUser(id, fields) {
  const allowed = ['username', 'email', 'display_name', 'enabled'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) { updates.push(`${key} = ?`); values.push(fields[key]); }
  }
  if (updates.length === 0) return getUserById(id);
  updates.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getUserById(id);
}

export function deleteUser(id) {
  // CASCADE will delete related sessions, accounts, rules
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function verifyUserPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user || !user.enabled) return null;
  const [salt, stored] = user.password_hash.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  if (hash !== stored) return null;
  return { id: user.id, username: user.username, display_name: user.display_name };
}

export function changeUserPassword(userId, newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  getDb().prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(`${salt}:${hash}`, userId);
}

// ==================== Sessions ====================

export function createSession(userType = 'admin', userId = null) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare('INSERT INTO sessions (id, user_type, user_id, expires_at) VALUES (?, ?, ?, ?)').run(id, userType, userId, expires);
  return { id, user_type: userType, user_id: userId, expires_at: expires };
}

export function getSession(sessionId) {
  return getDb().prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").get(sessionId);
}

export function deleteSession(sessionId) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// ==================== Settings ====================

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export function setSettings(obj) {
  const stmt = getDb().prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [key, value] of Object.entries(obj)) {
    stmt.run(key, value ?? '');
  }
}

// ==================== Accounts ====================

export function getAllAccounts() {
  return getDb().prepare('SELECT * FROM accounts ORDER BY id ASC').all();
}

export function getAccountsByUserId(userId) {
  return getDb().prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC').all(userId);
}

export function getEnabledAccounts() {
  return getDb().prepare('SELECT * FROM accounts WHERE enabled = 1 ORDER BY id ASC').all();
}

export function getAccountById(id) {
  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

export function createAccount({ user_id = null, name, enabled = 1, host, port = 993, username, password = null, password_mode = 'manual', password_prefix = null, password_suffix = null, poll_speed = 'normal' }) {
  const result = getDb().prepare(
    `INSERT INTO accounts (user_id, name, enabled, host, port, username, password, password_mode, password_prefix, password_suffix, poll_speed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user_id, name, enabled, host, port, username, password, password_mode, password_prefix, password_suffix, poll_speed);

  const accountId = Number(result.lastInsertRowid);

  // Initialize poller_state for this account
  getDb().prepare('INSERT INTO poller_state (account_id, last_uid) VALUES (?, 0)').run(accountId);

  return getAccountById(accountId);
}

export function updateAccount(id, fields) {
  const allowed = ['user_id', 'name', 'enabled', 'host', 'port', 'username', 'password', 'password_mode', 'password_prefix', 'password_suffix', 'poll_speed'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) { updates.push(`${key} = ?`); values.push(fields[key]); }
  }
  if (updates.length === 0) return getAccountById(id);
  updates.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getAccountById(id);
}

export function deleteAccount(id) {
  // CASCADE will delete related poller_state, processed_emails
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

// ==================== Rules ====================

export function getAllRules() {
  return getDb().prepare('SELECT * FROM rules ORDER BY priority DESC, id ASC').all();
}

export function getRulesByUserId(userId) {
  return getDb().prepare('SELECT * FROM rules WHERE user_id = ? ORDER BY priority DESC, id ASC').all(userId);
}

export function getEnabledRules(source = null, accountId = null) {
  let query = 'SELECT * FROM rules WHERE enabled = 1';
  const params = [];

  if (source) {
    query += " AND (source = ? OR source = 'all')";
    params.push(source);
  }

  if (accountId !== null) {
    query += ' AND (account_id IS NULL OR account_id = ?)';
    params.push(accountId);
  }

  query += ' ORDER BY priority DESC, id ASC';
  return getDb().prepare(query).all(...params);
}

export function getRuleById(id) {
  return getDb().prepare('SELECT * FROM rules WHERE id = ?').get(id);
}

export function createRule({ user_id = null, name, enabled = 1, source = 'all', account_id = null, match_type = 'all', conditions = '[]', chatwork_room_id, message_template = '', priority = 0 }) {
  const cond = typeof conditions === 'string' ? conditions : JSON.stringify(conditions);
  const result = getDb().prepare(
    `INSERT INTO rules (user_id, name, enabled, source, account_id, match_type, conditions, chatwork_room_id, message_template, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user_id, name, enabled, source, account_id, match_type, cond, chatwork_room_id, message_template, priority);
  return getRuleById(Number(result.lastInsertRowid));
}

export function updateRule(id, fields) {
  if (fields.conditions && typeof fields.conditions !== 'string') {
    fields.conditions = JSON.stringify(fields.conditions);
  }
  const allowed = ['user_id', 'name', 'enabled', 'source', 'account_id', 'match_type', 'conditions', 'chatwork_room_id', 'message_template', 'priority'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) { updates.push(`${key} = ?`); values.push(fields[key]); }
  }
  if (updates.length === 0) return getRuleById(id);
  updates.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getRuleById(id);
}

export function deleteRule(id) {
  getDb().prepare('DELETE FROM rules WHERE id = ?').run(id);
}

// ==================== Processed Emails ====================

export function isEmailProcessed(accountId, imapUid) {
  const row = getDb().prepare('SELECT id FROM processed_emails WHERE account_id = ? AND imap_uid = ?').get(accountId, imapUid);
  return !!row;
}

export function recordProcessedEmail({ account_id, imap_uid, rule_id, sender, subject, status, error_message = null, chatwork_room_id = null }) {
  getDb().prepare(
    `INSERT OR IGNORE INTO processed_emails (account_id, imap_uid, rule_id, sender, subject, status, error_message, chatwork_room_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(account_id, imap_uid, rule_id, sender, subject, status, error_message, chatwork_room_id);
}

export function getProcessedEmails({ limit = 50, offset = 0, status = null, accountId = null, userId = null } = {}) {
  let query = 'SELECT * FROM processed_emails';
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (accountId !== null) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }

  if (userId !== null) {
    conditions.push('account_id IN (SELECT id FROM accounts WHERE user_id = ?)');
    params.push(userId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY processed_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return getDb().prepare(query).all(...params);
}

export function getProcessedEmailsByUserId(userId, options = {}) {
  return getProcessedEmails({ ...options, userId });
}

export function getProcessedEmailStats(accountId = null, userId = null) {
  let query = `SELECT status, COUNT(*) as count FROM processed_emails
     WHERE processed_at >= datetime('now', '-24 hours')`;
  const params = [];

  if (accountId !== null) {
    query += ' AND account_id = ?';
    params.push(accountId);
  }

  if (userId !== null) {
    query += ' AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
    params.push(userId);
  }

  query += ' GROUP BY status';

  const rows = getDb().prepare(query).all(...params);
  const stats = { sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

// ==================== Poller State ====================

export function getPollerState(accountId) {
  return getDb().prepare('SELECT * FROM poller_state WHERE account_id = ?').get(accountId);
}

export function updatePollerState(accountId, { last_uid, last_poll_at }) {
  const fields = [];
  const values = [];
  if (last_uid !== undefined) { fields.push('last_uid = ?'); values.push(last_uid); }
  if (last_poll_at !== undefined) { fields.push('last_poll_at = ?'); values.push(last_poll_at); }
  if (fields.length === 0) return;
  values.push(accountId);
  getDb().prepare(`UPDATE poller_state SET ${fields.join(', ')} WHERE account_id = ?`).run(...values);
}
