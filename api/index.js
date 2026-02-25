// Vercel serverless function with full features
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stores
const sessions = new Map();
const users = new Map();
const accounts = new Map();
const rules = new Map();

// Initialize with test user
users.set(1, {
  id: 1,
  username: 'testuser',
  password: 'test123', // Plain text for simplicity
  email: 'test@example.com',
  display_name: 'Test User',
  enabled: 1,
  created_at: new Date().toISOString()
});

let nextUserId = 2;
let nextAccountId = 1;
let nextRuleId = 1;

const COOKIE_NAME = 's2c_session';

// ===== Middleware =====

function sessionMiddleware(req, res, next) {
  req.auth = { isAdmin: false, isUser: false, userId: null, username: null };
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const sessionCookie = cookies.find(c => c.startsWith(COOKIE_NAME + '='));

  if (sessionCookie) {
    const sessionId = sessionCookie.split('=')[1];
    req.sessionId = sessionId;
    const session = sessions.get(sessionId);

    if (session && session.expires > Date.now()) {
      if (session.userType === 'admin') {
        req.auth.isAdmin = true;
      } else if (session.userType === 'user') {
        req.auth.isUser = true;
        req.auth.userId = session.userId;
        req.auth.username = session.username;
      }
    }
  }
  next();
}

app.use(sessionMiddleware);

function requireAdmin(req, res, next) {
  if (!req.auth.isAdmin) return res.status(403).json({ error: '管理者権限が必要です' });
  next();
}

function requireUser(req, res, next) {
  if (!req.auth.isUser) return res.status(403).json({ error: 'ユーザーログインが必要です' });
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth.isAdmin && !req.auth.isUser) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// ===== Auth Routes =====

app.post('/api/auth/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (password === adminPassword) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, { userType: 'admin', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    res.json({ success: true, userType: 'admin' });
  } else {
    res.status(401).json({ error: 'パスワードが間違っています' });
  }
});

app.post('/api/auth/user/login', (req, res) => {
  const { username, password } = req.body;

  const user = Array.from(users.values()).find(u => u.username === username && u.password === password && u.enabled);

  if (user) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, { userType: 'user', userId: user.id, username: user.username, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    res.json({ success: true, userType: 'user', userId: user.id, username: user.username });
  } else {
    res.status(401).json({ error: 'ユーザーIDまたはパスワードが間違っています' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionId) sessions.delete(req.sessionId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (req.auth.isAdmin) {
    return res.json({ loggedIn: true, userType: 'admin' });
  }
  if (req.auth.isUser) {
    return res.json({ loggedIn: true, userType: 'user', userId: req.auth.userId, username: req.auth.username, displayName: req.auth.username });
  }
  res.json({ loggedIn: false });
});

app.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth working!', sessions: sessions.size });
});

// ===== Admin - User Management =====

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const userList = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    display_name: u.display_name,
    enabled: u.enabled,
    created_at: u.created_at,
    updated_at: u.updated_at
  }));
  res.json(userList);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, email, display_name, enabled } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザーIDとパスワードは必須です' });
  }

  const exists = Array.from(users.values()).find(u => u.username === username);
  if (exists) {
    return res.status(400).json({ error: 'このユーザーIDは既に使用されています' });
  }

  const newUser = {
    id: nextUserId++,
    username,
    password,
    email: email || null,
    display_name: display_name || null,
    enabled: enabled !== undefined ? enabled : 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  users.set(newUser.id, newUser);
  res.json({ success: true, id: newUser.id });
});

app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = users.get(parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json(user);
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.get(id);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const { username, email, display_name, enabled } = req.body;
  if (username) user.username = username;
  if (email !== undefined) user.email = email;
  if (display_name !== undefined) user.display_name = display_name;
  if (enabled !== undefined) user.enabled = enabled;
  user.updated_at = new Date().toISOString();

  res.json({ success: true });
});

app.put('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.get(id);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードは必須です' });

  user.password = password;
  user.updated_at = new Date().toISOString();
  res.json({ success: true, message: 'パスワードをリセットしました' });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  users.delete(id);
  // Delete user's accounts and rules
  for (const [accId, acc] of accounts.entries()) {
    if (acc.user_id === id) accounts.delete(accId);
  }
  for (const [ruleId, rule] of rules.entries()) {
    if (rule.user_id === id) rules.delete(ruleId);
  }
  res.json({ success: true });
});

// ===== Status =====

app.get('/api/status', (req, res) => {
  const accountList = req.auth.isAdmin
    ? Array.from(accounts.values())
    : Array.from(accounts.values()).filter(a => a.user_id === req.auth.userId);

  res.json({
    accounts: accountList.map(a => ({ ...a, status: 'stopped', lastPoll: null })),
    stats: { total: accountList.length, active: 0, errors: 0 }
  });
});

// ===== Accounts =====

app.get('/api/accounts', requireAuth, (req, res) => {
  const accountList = req.auth.isAdmin
    ? Array.from(accounts.values())
    : Array.from(accounts.values()).filter(a => a.user_id === req.auth.userId);
  res.json(accountList);
});

app.post('/api/accounts', requireAuth, (req, res) => {
  const data = req.body;
  const newAccount = {
    id: nextAccountId++,
    user_id: req.auth.isAdmin ? data.user_id : req.auth.userId,
    name: data.name,
    enabled: data.enabled !== undefined ? data.enabled : 1,
    host: data.host,
    port: data.port || 993,
    username: data.username,
    password: data.password,
    password_mode: data.password_mode || 'manual',
    password_prefix: data.password_prefix,
    password_suffix: data.password_suffix,
    poll_speed: data.poll_speed || 'normal',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  accounts.set(newAccount.id, newAccount);
  res.json(newAccount);
});

app.delete('/api/accounts/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const account = accounts.get(id);
  if (!account) return res.status(404).json({ error: 'アカウントが見つかりません' });
  if (!req.auth.isAdmin && account.user_id !== req.auth.userId) {
    return res.status(403).json({ error: '権限がありません' });
  }
  accounts.delete(id);
  res.json({ success: true });
});

// ===== Rules =====

app.get('/api/rules', requireAuth, (req, res) => {
  const ruleList = req.auth.isAdmin
    ? Array.from(rules.values())
    : Array.from(rules.values()).filter(r => r.user_id === req.auth.userId);
  res.json(ruleList);
});

app.post('/api/rules', requireAuth, (req, res) => {
  const data = req.body;
  const newRule = {
    id: nextRuleId++,
    user_id: req.auth.isAdmin ? data.user_id : req.auth.userId,
    name: data.name,
    enabled: data.enabled !== undefined ? data.enabled : 1,
    source: data.source || 'all',
    account_id: data.account_id || null,
    match_type: data.match_type || 'all',
    conditions: data.conditions || [],
    chatwork_room_id: data.chatwork_room_id,
    message_template: data.message_template || '',
    priority: data.priority || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  rules.set(newRule.id, newRule);
  res.json(newRule);
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const rule = rules.get(id);
  if (!rule) return res.status(404).json({ error: 'ルールが見つかりません' });
  if (!req.auth.isAdmin && rule.user_id !== req.auth.userId) {
    return res.status(403).json({ error: '権限がありません' });
  }
  rules.delete(id);
  res.json({ success: true });
});

// ===== Logs =====

app.get('/api/logs', requireAuth, (req, res) => {
  res.json([]); // Empty for now
});

// ===== Settings =====

app.get('/api/settings', requireAuth, (req, res) => {
  res.json({});
});

app.put('/api/settings', requireAuth, (req, res) => {
  res.json({ success: true });
});

// ===== Error handler =====

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

export default app;
