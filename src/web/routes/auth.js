import { Router } from 'express';
import { verifyAdminPassword, changeAdminPassword, createSession, deleteSession } from '../../db/database.js';
import { requireAuth, COOKIE_NAME } from '../middleware/session.js';
import { logger } from '../../logger.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
  if (!verifyAdminPassword(password)) return res.status(401).json({ error: 'パスワードが間違っています' });
  const session = createSession();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
  res.json({ success: true });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionId) deleteSession(req.sessionId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ loggedIn: !!req.isAdmin });
});

// PUT /api/auth/password — change admin password
router.put('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
  if (!verifyAdminPassword(currentPassword)) return res.status(401).json({ error: '現在のパスワードが間違っています' });
  changeAdminPassword(newPassword);
  logger.info('Admin password changed');
  res.json({ success: true, message: 'パスワードを変更しました' });
});

export default router;
