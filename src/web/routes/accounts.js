import { Router } from 'express';
import { getAllAccounts, getAccountById, createAccount, updateAccount, deleteAccount } from '../../db/database.js';
import { testImapConnection } from '../../imap/auth.js';
import { startPollerForAccount, stopPollerForAccount, restartPollerForAccount } from '../../imap/poller.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';

const router = Router();
router.use(requireAuth);

// GET /api/accounts - 全アカウント取得
router.get('/', (req, res) => {
  const accounts = getAllAccounts();
  // パスワードをマスク
  const safe = accounts.map(acc => ({
    ...acc,
    password: acc.password ? '****' + acc.password.slice(-4) : null,
    password_prefix: acc.password_prefix ? '****' + acc.password_prefix.slice(-4) : null,
    password_suffix: acc.password_suffix ? '****' + acc.password_suffix.slice(-4) : null,
  }));
  res.json(safe);
});

// GET /api/accounts/:id - 特定アカウント取得
router.get('/:id', (req, res) => {
  const account = getAccountById(Number(req.params.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });

  // パスワードをマスク
  const safe = {
    ...account,
    password: account.password ? '****' + account.password.slice(-4) : null,
    password_prefix: account.password_prefix ? '****' + account.password_prefix.slice(-4) : null,
    password_suffix: account.password_suffix ? '****' + account.password_suffix.slice(-4) : null,
  };

  res.json(safe);
});

// POST /api/accounts - アカウント作成
router.post('/', async (req, res, next) => {
  try {
    const { name, enabled, host, port, username, password, password_mode, password_prefix, password_suffix, poll_speed } = req.body;

    if (!name || !host || !username) {
      return res.status(400).json({ error: 'name, host, username are required' });
    }

    const account = createAccount({
      name,
      enabled: enabled ?? 1,
      host,
      port: port || 993,
      username,
      password,
      password_mode: password_mode || 'manual',
      password_prefix,
      password_suffix,
      poll_speed: poll_speed || 'normal',
    });

    logger.info(`Account created: ${account.name} (ID: ${account.id})`);

    // 有効なアカウントならポーラーを起動
    if (account.enabled) {
      startPollerForAccount(account);
    }

    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

// PUT /api/accounts/:id - アカウント更新
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = getAccountById(id);
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    // マスクされた値はスキップ
    const updates = { ...req.body };
    if (updates.password && updates.password.startsWith('****')) delete updates.password;
    if (updates.password_prefix && updates.password_prefix.startsWith('****')) delete updates.password_prefix;
    if (updates.password_suffix && updates.password_suffix.startsWith('****')) delete updates.password_suffix;

    const account = updateAccount(id, updates);
    logger.info(`Account updated: ${account.name} (ID: ${account.id})`);

    // ポーラーを再起動
    if (account.enabled) {
      restartPollerForAccount(account);
    } else {
      stopPollerForAccount(account.id);
    }

    res.json(account);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/accounts/:id - アカウント削除
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getAccountById(id);
  if (!existing) return res.status(404).json({ error: 'Account not found' });

  stopPollerForAccount(id);
  deleteAccount(id);
  logger.info(`Account deleted: ${existing.name} (ID: ${id})`);

  res.json({ success: true });
});

// POST /api/accounts/:id/test - 接続テスト
router.post('/:id/test', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const account = getAccountById(id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const result = await testImapConnection(account);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/accounts/:id/restart - ポーラー再起動
router.post('/:id/restart', (req, res) => {
  const id = Number(req.params.id);
  const account = getAccountById(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  if (account.enabled) {
    restartPollerForAccount(account);
    res.json({ success: true, message: 'Poller restarted' });
  } else {
    res.status(400).json({ error: 'Account is disabled' });
  }
});

export default router;
