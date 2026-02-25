import { Router } from 'express';
import { getProcessedEmails } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { requireAuth as requireAnyAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAnyAuth);

// GET /api/logs - ログ取得（ユーザーは自分のみ、管理者は全て）
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const status = req.query.status || null;
  const accountId = req.query.accountId ? parseInt(req.query.accountId, 10) : null;

  const options = { limit, offset, status, accountId };

  // ユーザーは自分のログのみ
  if (req.auth.isUser) {
    options.userId = req.auth.userId;
  }

  res.json(await getProcessedEmails(options));
});

export default router;
