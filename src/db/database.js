/**
 * Database abstraction layer
 * Lazy-loading wrapper that switches between SQLite and PostgreSQL
 */

const usePostgres = !!process.env.DATABASE_URL;
let dbModule = null;

async function getDbModule() {
  if (!dbModule) {
    if (usePostgres) {
      console.log('📊 Loading PostgreSQL database module');
      dbModule = await import('./database.postgres.js');
    } else {
      console.log('📊 Loading SQLite database module');
      dbModule = await import('./database.sqlite.js');
    }
  }
  return dbModule;
}

// Admin Auth
export async function verifyAdminPassword(password) {
  const db = await getDbModule();
  return db.verifyAdminPassword(password);
}

export async function changeAdminPassword(newPassword) {
  const db = await getDbModule();
  return db.changeAdminPassword(newPassword);
}

// Users
export async function getAllUsers() {
  const db = await getDbModule();
  return db.getAllUsers();
}

export async function getUserById(id) {
  const db = await getDbModule();
  return db.getUserById(id);
}

export async function getUserByUsername(username) {
  const db = await getDbModule();
  return db.getUserByUsername(username);
}

export async function createUser(data) {
  const db = await getDbModule();
  return db.createUser(data);
}

export async function updateUser(id, fields) {
  const db = await getDbModule();
  return db.updateUser(id, fields);
}

export async function deleteUser(id) {
  const db = await getDbModule();
  return db.deleteUser(id);
}

export async function verifyUserPassword(username, password) {
  const db = await getDbModule();
  return db.verifyUserPassword(username, password);
}

export async function changeUserPassword(userId, newPassword) {
  const db = await getDbModule();
  return db.changeUserPassword(userId, newPassword);
}

// Sessions
export async function createSession(userType, userId) {
  const db = await getDbModule();
  return db.createSession(userType, userId);
}

export async function getSession(id) {
  const db = await getDbModule();
  return db.getSession(id);
}

export async function deleteSession(id) {
  const db = await getDbModule();
  return db.deleteSession(id);
}

export async function cleanExpiredSessions() {
  const db = await getDbModule();
  return db.cleanExpiredSessions();
}

// Accounts
export async function getAllAccounts() {
  const db = await getDbModule();
  return db.getAllAccounts();
}

export async function getEnabledAccounts() {
  const db = await getDbModule();
  return db.getEnabledAccounts();
}

export async function getAccountById(id) {
  const db = await getDbModule();
  return db.getAccountById(id);
}

export async function getAccountsByUserId(userId) {
  const db = await getDbModule();
  return db.getAccountsByUserId(userId);
}

export async function createAccount(data) {
  const db = await getDbModule();
  return db.createAccount(data);
}

export async function updateAccount(id, fields) {
  const db = await getDbModule();
  return db.updateAccount(id, fields);
}

export async function deleteAccount(id) {
  const db = await getDbModule();
  return db.deleteAccount(id);
}

// Rules
export async function getAllRules() {
  const db = await getDbModule();
  return db.getAllRules();
}

export async function getEnabledRules(source, accountId) {
  const db = await getDbModule();
  return db.getEnabledRules(source, accountId);
}

export async function getRuleById(id) {
  const db = await getDbModule();
  return db.getRuleById(id);
}

export async function getRulesByUserId(userId) {
  const db = await getDbModule();
  return db.getRulesByUserId(userId);
}

export async function getRulesByAccountId(accountId) {
  const db = await getDbModule();
  return db.getRulesByAccountId(accountId);
}

export async function createRule(data) {
  const db = await getDbModule();
  return db.createRule(data);
}

export async function updateRule(id, fields) {
  const db = await getDbModule();
  return db.updateRule(id, fields);
}

export async function deleteRule(id) {
  const db = await getDbModule();
  return db.deleteRule(id);
}

// Logs
export async function getAllProcessedEmails(options) {
  const db = await getDbModule();
  return db.getAllProcessedEmails(options);
}

export async function getProcessedEmails(options) {
  const db = await getDbModule();
  return db.getProcessedEmails ? db.getProcessedEmails(options) : db.getAllProcessedEmails(options);
}

export async function getProcessedEmailStats() {
  const db = await getDbModule();
  return db.getProcessedEmailStats();
}

export async function getProcessedEmailsByUserId(userId, options) {
  const db = await getDbModule();
  return db.getProcessedEmailsByUserId(userId, options);
}

export async function createProcessedEmail(data) {
  const db = await getDbModule();
  return db.createProcessedEmail(data);
}

export async function isEmailProcessed(accountId, uid) {
  const db = await getDbModule();
  return db.isEmailProcessed(accountId, uid);
}

export async function recordProcessedEmail(data) {
  const db = await getDbModule();
  return db.recordProcessedEmail(data);
}

// Poller
export async function getPollerState(accountId) {
  const db = await getDbModule();
  return db.getPollerState(accountId);
}

export async function updatePollerState(accountId, data) {
  const db = await getDbModule();
  return db.updatePollerState(accountId, data);
}

// Settings
export async function getSetting(key) {
  const db = await getDbModule();
  return db.getSetting(key);
}

export async function setSetting(key, value) {
  const db = await getDbModule();
  return db.setSetting(key, value);
}

export async function setSettings(settings) {
  const db = await getDbModule();
  return db.setSettings ? db.setSettings(settings) : Promise.all(Object.entries(settings).map(([k, v]) => db.setSetting(k, v)));
}

export async function getAllSettings() {
  const db = await getDbModule();
  return db.getAllSettings();
}

// Compatibility
export function getDb() {
  // For SQLite compatibility - not used in PostgreSQL
  if (!usePostgres) {
    const { DatabaseSync } = require('node:sqlite');
    // This will be handled by the SQLite module
  }
  return null;
}
