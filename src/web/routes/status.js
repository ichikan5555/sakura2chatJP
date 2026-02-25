import { Router } from 'express';
import { getProcessedEmailStats, getEnabledAccounts, getAccountsByUserId } from '../../db/database.js';
import { getAllPollerStatus } from '../../imap/poller.js';
import { requireAuth } from '../middleware/session.js';
import { requireAuth as requireAnyAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAnyAuth);

// GET /api/status - ステータス取得（ユーザーは自分のみ、管理者は全て）
router.get('/', async (req, res) => {
  let accounts;
  if (req.auth.isAdmin) {
    accounts = await getEnabledAccounts();
  } else if (req.auth.isUser) {
    accounts = (await getAccountsByUserId(req.auth.userId)).filter(a => a.enabled);
  } else {
    return res.status(401).json({ error: 'ログインが必要です' });
  }

  const pollerStatuses = getAllPollerStatus();

  const accountsStatus = accounts.map(acc => {
    const pollerState = pollerStatuses[acc.id] || { status: 'stopped', isPolling: false, lastError: null };
    return {
      id: acc.id,
      name: acc.name,
      username: acc.username,
      poll_speed: acc.poll_speed,
      status: pollerState.status,
      isPolling: pollerState.isPolling,
      lastError: pollerState.lastError,
    };
  });

  // ユーザーは自分の統計のみ
  const stats = req.auth.isAdmin
    ? await getProcessedEmailStats()
    : await getProcessedEmailStats(null, req.auth.userId);

  res.json({
    accounts: accountsStatus,
    stats24h: stats,
  });
});

export default router;
