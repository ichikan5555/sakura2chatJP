import { Router } from 'express';
import {
  getAllAccounts,
  getAllUsers,
  getProcessedEmails,
  getProcessedEmailStats
} from '../../../db/database.js';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../../logger.js';

const router = Router();

// All routes require admin
router.use(requireAdmin);

// GET /api/admin/monitor/accounts - Get all accounts with user info
router.get('/accounts', (req, res) => {
  try {
    const accounts = getAllAccounts();
    const users = getAllUsers();

    // Create user lookup map
    const userMap = {};
    for (const user of users) {
      userMap[user.id] = user;
    }

    // Enrich accounts with user info
    const enrichedAccounts = accounts.map(account => ({
      ...account,
      user: account.user_id ? userMap[account.user_id] : null
    }));

    res.json(enrichedAccounts);
  } catch (error) {
    logger.error('Error fetching account monitor data:', error);
    res.status(500).json({ error: 'アカウント情報の取得に失敗しました' });
  }
});

// GET /api/admin/monitor/stats - Get system-wide statistics
router.get('/stats', (req, res) => {
  try {
    const users = getAllUsers();
    const accounts = getAllAccounts();
    const stats = getProcessedEmailStats(); // All users

    // Count by user
    const userStats = {};
    for (const user of users) {
      const userAccounts = accounts.filter(a => a.user_id === user.id);
      const userEmailStats = getProcessedEmailStats(null, user.id);
      userStats[user.id] = {
        username: user.username,
        display_name: user.display_name,
        enabled: user.enabled,
        accountCount: userAccounts.length,
        emailStats: userEmailStats
      };
    }

    // Admin accounts (user_id = null)
    const adminAccounts = accounts.filter(a => a.user_id === null);
    const adminStats = getProcessedEmailStats();

    res.json({
      overall: {
        totalUsers: users.length,
        enabledUsers: users.filter(u => u.enabled).length,
        totalAccounts: accounts.length,
        enabledAccounts: accounts.filter(a => a.enabled).length,
        emailStats: stats
      },
      admin: {
        accountCount: adminAccounts.length,
        emailStats: adminStats
      },
      byUser: userStats
    });
  } catch (error) {
    logger.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'システム統計の取得に失敗しました' });
  }
});

// GET /api/admin/monitor/logs - Get all logs (with optional filters)
router.get('/logs', (req, res) => {
  try {
    const { limit = 50, offset = 0, status, userId, accountId } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    if (status) options.status = status;
    if (userId) options.userId = parseInt(userId);
    if (accountId) options.accountId = parseInt(accountId);

    const logs = getProcessedEmails(options);

    // Enrich with account info
    const accounts = getAllAccounts();
    const accountMap = {};
    for (const account of accounts) {
      accountMap[account.id] = account;
    }

    const enrichedLogs = logs.map(log => ({
      ...log,
      account: accountMap[log.account_id] || null
    }));

    res.json(enrichedLogs);
  } catch (error) {
    logger.error('Error fetching logs:', error);
    res.status(500).json({ error: 'ログの取得に失敗しました' });
  }
});

// GET /api/admin/monitor/overview - Quick dashboard overview
router.get('/overview', (req, res) => {
  try {
    const users = getAllUsers();
    const accounts = getAllAccounts();
    const stats = getProcessedEmailStats();

    const overview = {
      users: {
        total: users.length,
        enabled: users.filter(u => u.enabled).length,
        disabled: users.filter(u => !u.enabled).length
      },
      accounts: {
        total: accounts.length,
        enabled: accounts.filter(a => a.enabled).length,
        disabled: accounts.filter(a => !a.enabled).length,
        bySpeed: {
          high: accounts.filter(a => a.poll_speed === 'high').length,
          normal: accounts.filter(a => a.poll_speed === 'normal').length
        }
      },
      emails24h: {
        sent: stats.sent || 0,
        failed: stats.failed || 0,
        skipped: stats.skipped || 0,
        total: (stats.sent || 0) + (stats.failed || 0) + (stats.skipped || 0)
      }
    };

    res.json(overview);
  } catch (error) {
    logger.error('Error fetching overview:', error);
    res.status(500).json({ error: '概要情報の取得に失敗しました' });
  }
});

export default router;
