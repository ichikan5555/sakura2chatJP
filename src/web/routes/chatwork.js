import { Router } from 'express';
import { getRooms } from '../../chatwork/client.js';
import { setting } from '../../config.js';
import { requireAuth } from '../middleware/session.js';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

function mapRooms(rooms) {
  return rooms.map(r => ({
    room_id: r.room_id, name: r.name, type: r.type,
    typeLabel: r.type === 'group' ? 'グループ' : r.type === 'direct' ? 'ダイレクト' : 'マイチャット',
  }));
}

router.get('/rooms', async (req, res, next) => {
  try {
    if (!setting('chatwork.apiToken')) return res.status(400).json({ error: 'Chatwork APIトークンが未設定です' });
    const rooms = await getRooms();
    res.json(mapRooms(rooms));
  } catch (err) { next(err); }
});

router.get('/rooms/export-excel', async (req, res) => {
  try {
    if (!setting('chatwork.apiToken')) return res.status(400).json({ error: 'Chatwork APIトークンが未設定です' });
    const rooms = await getRooms();
    const data = mapRooms(rooms).map(r => ({
      'ルームID': r.room_id,
      'ルーム名': r.name,
      '種別': r.typeLabel,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'ルーム一覧');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="chatwork_rooms.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Excelエクスポートに失敗しました' });
  }
});

export default router;
