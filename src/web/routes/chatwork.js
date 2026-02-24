import { Router } from 'express';
import { getRooms } from '../../chatwork/client.js';
import { setting } from '../../config.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
router.use(requireAuth);

router.get('/rooms', async (req, res, next) => {
  try {
    if (!setting('chatwork.apiToken')) return res.status(400).json({ error: 'Chatwork APIトークンが未設定です' });
    const rooms = await getRooms();
    res.json(rooms.map(r => ({
      room_id: r.room_id, name: r.name, type: r.type,
      typeLabel: r.type === 'group' ? 'グループ' : r.type === 'direct' ? 'ダイレクト' : 'マイチャット',
    })));
  } catch (err) { next(err); }
});

export default router;
