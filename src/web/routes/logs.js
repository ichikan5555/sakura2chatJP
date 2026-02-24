import { Router } from 'express';
import { getProcessedEmails } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const status = req.query.status || null;
  res.json(getProcessedEmails({ limit, offset, status }));
});

export default router;
