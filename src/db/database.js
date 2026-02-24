/**
 * Database abstraction layer
 * Automatically switches between SQLite (local) and PostgreSQL (production)
 */

const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  // Use PostgreSQL for production (Vercel/Supabase)
  console.log('📊 Using PostgreSQL database');
  const pgModule = await import('./database.postgres.js');

  // Re-export all PostgreSQL functions
  export const {
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
    getAllSettings,
    getDb
  } = pgModule;

} else {
  // Use SQLite for local development
  console.log('📊 Using SQLite database');
  const sqliteModule = await import('./database.sqlite.js');

  // Re-export all SQLite functions
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
  } = sqliteModule;
}
