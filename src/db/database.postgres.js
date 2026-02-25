import crypto from 'crypto';
import { query, getClient } from './postgres.js';
import { logger } from '../logger.js';

// ==================== Admin Auth ====================

export async function verifyAdminPassword(password) {
  const result = await query('SELECT password_hash FROM admin WHERE id = 1');
  if (result.rows.length === 0) return false;
  const [salt, stored] = result.rows[0].password_hash.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === stored;
}

export async function changeAdminPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  await query('UPDATE admin SET password_hash = $1 WHERE id = 1', [`${salt}:${hash}`]);
}

// ==================== Users ====================

export async function getAllUsers() {
  const result = await query('SELECT id, username, email, display_name, enabled, created_at, updated_at FROM users ORDER BY id ASC');
  return result.rows;
}

export async function getUserById(id) {
  const result = await query('SELECT id, username, email, display_name, enabled, created_at, updated_at FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getUserByUsername(username) {
  const result = await query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

export async function createUser({ username, password, email = null, display_name = null, enabled = 1 }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const result = await query(
    'INSERT INTO users (username, email, password_hash, display_name, enabled) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [username, email, `${salt}:${hash}`, display_name, enabled]
  );
  logger.info(`User created: ${username} (ID: ${result.rows[0].id})`);
  return getUserById(result.rows[0].id);
}

export async function updateUser(id, fields) {
  const allowed = ['username', 'email', 'display_name', 'enabled'];
  const updates = [];
  const values = [];
  let paramCount = 1;
  for (const key of allowed) {
    if (key in fields) { updates.push(`${key} = $${paramCount}`); values.push(fields[key]); paramCount++; }
  }
  if (updates.length === 0) return getUserById(id);
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
  return getUserById(id);
}

export async function deleteUser(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

export async function verifyUserPassword(username, password) {
  const user = await getUserByUsername(username);
  if (!user || !user.enabled) return null;
  const [salt, stored] = user.password_hash.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  if (hash !== stored) return null;
  return { id: user.id, username: user.username, display_name: user.display_name };
}

export async function changeUserPassword(userId, newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [`${salt}:${hash}`, userId]);
}

// ==================== Sessions ====================

export async function createSession(userType = 'admin', userId = null) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO sessions (id, user_type, user_id, expires_at) VALUES ($1, $2, $3, $4)', [id, userType, userId, expires]);
  return { id, user_type: userType, user_id: userId, expires_at: expires };
}

export async function getSession(id) {
  const result = await query('SELECT * FROM sessions WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP', [id]);
  return result.rows[0] || null;
}

export async function deleteSession(id) {
  await query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function cleanExpiredSessions() {
  const result = await query('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
  return result.rowCount;
}

// ==================== Settings ====================

export async function getSetting(key) {
  const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

export async function setSetting(key, value) {
  await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', [key, value]);
}

export async function getAllSettings() {
  const result = await query('SELECT * FROM settings');
  const settings = {};
  for (const row of result.rows) { settings[row.key] = row.value; }
  return settings;
}

// ==================== Accounts (Stub) ====================
export async function getAllAccounts() { return []; }
export async function getEnabledAccounts() { return []; }
export async function getAccountById(id) { return null; }
export async function getAccountsByUserId(userId) { return []; }
export async function createAccount(data) { return null; }
export async function updateAccount(id, fields) { return null; }
export async function deleteAccount(id) { }

// ==================== Rules (Stub) ====================
export async function getAllRules() { return []; }
export async function getEnabledRules(source = null, accountId = null) { return []; }
export async function getRuleById(id) { return null; }
export async function getRulesByUserId(userId) { return []; }
export async function getRulesByAccountId(accountId) { return []; }
export async function createRule(data) { return null; }
export async function updateRule(id, fields) { return null; }
export async function deleteRule(id) { }

// ==================== Logs (Stub) ====================
export async function getAllProcessedEmails(options = {}) { return []; }
export async function getProcessedEmailsByUserId(userId, options = {}) { return []; }
export async function createProcessedEmail(data) { return null; }
export async function isEmailProcessed(accountId, uid) { return false; }
export async function recordProcessedEmail(data) { return null; }

// ==================== Poller (Stub) ====================
export async function getPollerState(accountId) { return null; }
export async function updatePollerState(accountId, data) { }

// ==================== Compatibility ====================
export function getDb() { return null; }
