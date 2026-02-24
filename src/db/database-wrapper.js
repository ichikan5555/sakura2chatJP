/**
 * Database wrapper - automatically switches between SQLite and PostgreSQL
 * based on DATABASE_URL environment variable
 */

const usePostgres = !!process.env.DATABASE_URL;

let dbModule;

if (usePostgres) {
  console.log('Using PostgreSQL database');
  // Dynamic import for PostgreSQL version
  dbModule = await import('./database.postgres.js');
} else {
  console.log('Using SQLite database');
  // Dynamic import for SQLite version
  dbModule = await import('./database.js');
}

// Re-export all functions
export const {
  getDb,
  verifyAdminPassword,
  changeAdminPassword,
  getAllUsers,
  getUserById,
  getUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  verifyUserPassword,
  changeUserPassword,
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions,
  getAllAccounts,
  getAccountById,
  getAccountsByUserId,
  createAccount,
  updateAccount,
  deleteAccount,
  getAllRules,
  getRuleById,
  getRulesByUserId,
  getRulesByAccountId,
  createRule,
  updateRule,
  deleteRule,
  getAllProcessedEmails,
  getProcessedEmailsByUserId,
  createProcessedEmail,
  getPollerState,
  updatePollerState,
  getSetting,
  setSetting,
  getAllSettings
} = dbModule;

export default dbModule.default || dbModule;
