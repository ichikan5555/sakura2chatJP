import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword
} from '../../../db/database.js';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../../logger.js';

const router = Router();

// All routes require admin
router.use(requireAdmin);

// GET /api/admin/users - Get all users
router.get('/', (req, res) => {
  try {
    const users = getAllUsers();
    res.json(users);
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
  }
});

// GET /api/admin/users/:id - Get user by ID
router.get('/:id', (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }
    res.json(user);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'ユーザーの取得に失敗しました' });
  }
});

// POST /api/admin/users - Create new user
router.post('/', (req, res) => {
  try {
    const { username, password, email, display_name, enabled } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'ユーザーIDとパスワードは必須です' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'パスワードは4文字以上である必要があります' });
    }

    const user = createUser({
      username,
      password,
      email: email || null,
      display_name: display_name || null,
      enabled: enabled !== undefined ? enabled : 1
    });

    logger.info(`User created: ${username} (ID: ${user.id})`);
    res.status(201).json(user);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'このユーザーIDは既に使用されています' });
    }
    logger.error('Error creating user:', error);
    res.status(500).json({ error: 'ユーザーの作成に失敗しました' });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const user = getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const { username, email, display_name, enabled } = req.body;
    const updates = {};

    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (display_name !== undefined) updates.display_name = display_name;
    if (enabled !== undefined) updates.enabled = enabled;

    const updatedUser = updateUser(userId, updates);
    logger.info(`User updated: ${updatedUser.username} (ID: ${userId})`);
    res.json(updatedUser);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'このユーザーIDは既に使用されています' });
    }
    logger.error('Error updating user:', error);
    res.status(500).json({ error: 'ユーザーの更新に失敗しました' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const user = getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    deleteUser(userId);
    logger.info(`User deleted: ${user.username} (ID: ${userId})`);
    res.json({ success: true, message: 'ユーザーを削除しました' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ error: 'ユーザーの削除に失敗しました' });
  }
});

// PUT /api/admin/users/:id/password - Reset user password
router.put('/:id/password', (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: '新しいパスワードを入力してください' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'パスワードは4文字以上である必要があります' });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    changeUserPassword(userId, newPassword);
    logger.info(`User password reset: ${user.username} (ID: ${userId})`);
    res.json({ success: true, message: 'パスワードをリセットしました' });
  } catch (error) {
    logger.error('Error resetting password:', error);
    res.status(500).json({ error: 'パスワードのリセットに失敗しました' });
  }
});

export default router;
