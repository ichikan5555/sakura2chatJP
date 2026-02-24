import { Router } from 'express';
import { getAllRules, getRuleById, createRule, updateRule, deleteRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => { res.json(getAllRules()); });

router.get('/:id', (req, res) => {
  const rule = getRuleById(Number(req.params.id));
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  res.json(rule);
});

router.post('/', (req, res) => {
  const { name, enabled, source, match_type, conditions, chatwork_room_id, message_template, priority } = req.body;
  if (!name || !chatwork_room_id) return res.status(400).json({ error: 'name and chatwork_room_id are required' });
  res.status(201).json(createRule({ name, enabled, source, match_type, conditions, chatwork_room_id, message_template, priority }));
});

router.put('/:id', (req, res) => {
  if (!getRuleById(Number(req.params.id))) return res.status(404).json({ error: 'Rule not found' });
  res.json(updateRule(Number(req.params.id), req.body));
});

router.delete('/:id', (req, res) => {
  if (!getRuleById(Number(req.params.id))) return res.status(404).json({ error: 'Rule not found' });
  deleteRule(Number(req.params.id));
  res.json({ success: true });
});

export default router;
