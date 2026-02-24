import { Router } from 'express';
import {
  verifyAdminPassword,
  changeAdminPassword,
  verifyUserPassword,
  changeUserPassword,
  createSession,
  deleteSession,
  getUserById
} from '../../db/database.js';
import { requireAuth, COOKIE_NAME } from '../middleware/session.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';
import { logger } from '../../logger.js';

const router = Router();

// TEST route to verify router works
router.get('/test', (req, res) => {
  res.json({ message: 'Router is working!', routes: ['admin/login', 'user/login', 'login', 'logout', 'me'] });
});

// POST /api/auth/admin/login - Admin login
router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
  if (!verifyAdminPassword(password)) return res.status(401).json({ error: 'パスワードが間違っています' });
  const session = createSession('admin', null);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
  res.json({ success: true, userType: 'admin' });
});

// POST /api/auth/user/login - User login
router.post('/user/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザーIDとパスワードを入力してください' });
  }

  const user = verifyUserPassword(username, password);
  if (!user) {
    return res.status(401).json({ error: 'ユーザーIDまたはパスワードが間違っています' });
  }

  const session = createSession('user', user.id);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
  logger.info(`User login: ${username}`);
  res.json({ success: true, userType: 'user', userId: user.id, username: user.username });
});

// POST /api/auth/login - Legacy admin login (for backward compatibility)
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
  if (!verifyAdminPassword(password)) return res.status(401).json({ error: 'パスワードが間違っています' });
  const session = createSession('admin', null);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
  res.json({ success: true, userType: 'admin' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionId) deleteSession(req.sessionId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.auth.isAdmin) {
    return res.json({ loggedIn: true, userType: 'admin' });
  }
  if (req.auth.isUser) {
    const user = getUserById(req.auth.userId);
    return res.json({
      loggedIn: true,
      userType: 'user',
      userId: req.auth.userId,
      username: user?.username,
      displayName: user?.display_name
    });
  }
  res.json({ loggedIn: false });
});

// PUT /api/auth/password - Change admin password
router.put('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
  }
  if (!verifyAdminPassword(currentPassword)) {
    return res.status(401).json({ error: '現在のパスワードが間違っています' });
  }
  changeAdminPassword(newPassword);
  logger.info('Admin password changed');
  res.json({ success: true, message: 'パスワードを変更しました' });
});

// PUT /api/auth/user/password - Change user's own password
router.put('/user/password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
  }

  const user = getUserById(req.auth.userId);
  const verified = verifyUserPassword(user.username, currentPassword);
  if (!verified) {
    return res.status(401).json({ error: '現在のパスワードが間違っています' });
  }

  changeUserPassword(req.auth.userId, newPassword);
  logger.info(`User password changed: ${user.username}`);
  res.json({ success: true, message: 'パスワードを変更しました' });
});

export default router;
