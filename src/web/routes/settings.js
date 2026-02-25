import { Router } from 'express';
import { getAllSettings, setSettings } from '../../db/database.js';
import { reloadSettings } from '../../config.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';

const router = Router();
router.use(requireAuth);

const SETTING_KEYS = [
  'chatwork.apiToken',
];

// GET /api/settings
router.get('/', async (req, res) => {
  const all = await getAllSettings();
  const safe = {};
  for (const key of SETTING_KEYS) {
    const val = all[key] || '';
    // Mask sensitive fields
    if ((key.includes('Token') || key.includes('apiToken')) && val) {
      safe[key] = '****' + val.slice(-4);
    } else {
      safe[key] = val;
    }
  }
  res.json(safe);
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    const toSave = {};
    for (const key of SETTING_KEYS) {
      if (key in req.body) {
        const val = req.body[key];
        // Skip masked values
        if (typeof val === 'string' && val.startsWith('****')) continue;
        toSave[key] = val;
      }
    }
    if (Object.keys(toSave).length > 0) {
      await setSettings(toSave);
      const freshSettings = await getAllSettings();
      reloadSettings(() => freshSettings);
      logger.info(`Settings updated: ${Object.keys(toSave).join(', ')}`);
    }
    res.json({ success: true, message: '設定を保存しました' });
  } catch (err) {
    next(err);
  }
});

export default router;
