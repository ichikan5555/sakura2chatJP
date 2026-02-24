import { Router } from 'express';
import { getProcessedEmailStats, getEnabledAccounts } from '../../db/database.js';
import { getAllPollerStatus } from '../../imap/poller.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const accounts = getEnabledAccounts();
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

  res.json({
    accounts: accountsStatus,
    stats24h: getProcessedEmailStats(),
  });
});

export default router;
