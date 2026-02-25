import { Router } from 'express';
import { getAllRules, getRulesByUserId, getRuleById, createRule, updateRule, deleteRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { requireAuth as requireAnyAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAnyAuth);

// GET /api/rules - ルール取得（ユーザーは自分のみ、管理者は全て）
router.get('/', async (req, res) => {
  let rules;
  if (req.auth.isAdmin) {
    rules = await getAllRules();
  } else if (req.auth.isUser) {
    rules = await getRulesByUserId(req.auth.userId);
  } else {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  res.json(rules);
});

// GET /api/rules/:id - 特定ルール取得（権限チェック）
router.get('/:id', async (req, res) => {
  const rule = await getRuleById(Number(req.params.id));
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  // 権限チェック：ユーザーは自分のルールのみ
  if (req.auth.isUser && rule.user_id !== req.auth.userId) {
    return res.status(403).json({ error: 'アクセス権限がありません' });
  }

  res.json(rule);
});

// POST /api/rules - ルール作成（user_id自動設定）
router.post('/', async (req, res) => {
  const { name, enabled, source, account_id, match_type, conditions, chatwork_room_id, message_template, priority } = req.body;
  if (!name || !chatwork_room_id) return res.status(400).json({ error: 'name and chatwork_room_id are required' });

  // user_id設定：ユーザーは自分のID、管理者は指定可能（未指定ならnull）
  let userId = null;
  if (req.auth.isUser) {
    userId = req.auth.userId;
  } else if (req.auth.isAdmin && req.body.user_id !== undefined) {
    userId = req.body.user_id;
  }

  res.status(201).json(await createRule({
    user_id: userId,
    name,
    enabled,
    source,
    account_id,
    match_type,
    conditions,
    chatwork_room_id,
    message_template,
    priority
  }));
});

// PUT /api/rules/:id - ルール更新（権限チェック）
router.put('/:id', async (req, res) => {
  const rule = await getRuleById(Number(req.params.id));
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  // 権限チェック：ユーザーは自分のルールのみ
  if (req.auth.isUser && rule.user_id !== req.auth.userId) {
    return res.status(403).json({ error: 'アクセス権限がありません' });
  }

  // ユーザーはuser_idを変更できない
  const updates = { ...req.body };
  if (req.auth.isUser) {
    delete updates.user_id;
  }

  res.json(await updateRule(Number(req.params.id), updates));
});

// DELETE /api/rules/:id - ルール削除（権限チェック）
router.delete('/:id', async (req, res) => {
  const rule = await getRuleById(Number(req.params.id));
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  // 権限チェック：ユーザーは自分のルールのみ
  if (req.auth.isUser && rule.user_id !== req.auth.userId) {
    return res.status(403).json({ error: 'アクセス権限がありません' });
  }

  await deleteRule(Number(req.params.id));
  res.json({ success: true });
});

export default router;
