import { Router } from 'express';
import crypto from 'crypto';
import { sendMessage } from '../../chatwork/client.js';
import { logger } from '../../logger.js';

const router = Router();
const COOKIE_NAME = 's2c_session';

// In-memory stores
const sessions = new Map();
const verificationCodes = new Map();

// Parse ADMIN_EMAILS: "email1:roomId1,email2:roomId2"
function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  const entries = raw.split(',').map(e => e.trim()).filter(Boolean);
  const map = new Map();
  for (const entry of entries) {
    const [email, roomId] = entry.split(':').map(s => s.trim());
    if (email) map.set(email, roomId || null);
  }
  return map;
}

// Clean up expired codes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (data.expires < now) {
      verificationCodes.delete(email);
    }
  }
}, 60000);

// POST /api/auth/send-code - Send verification code
router.post('/send-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'メールアドレスを入力してください' });
  }

  const adminMap = parseAdminEmails();

  if (!adminMap.has(email)) {
    return res.status(401).json({ error: '登録されていないメールアドレスです' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

  verificationCodes.set(email, { code, expires });

  // Send code via Chatwork DM
  const roomId = adminMap.get(email);
  console.log(`[2FA] email=${email}, roomId=${roomId}, adminMap size=${adminMap.size}, entries:`, [...adminMap.entries()]);
  if (roomId) {
    try {
      const body = `[info][title]認証コード[/title]${code}\n（5分間有効）[/info]`;
      await sendMessage(roomId, body);
      logger.info(`Verification code sent to Chatwork room ${roomId} for ${email}`);
      return res.json({ success: true, message: 'Chatworkに認証コードを送信しました' });
    } catch (err) {
      logger.error(`Failed to send Chatwork code for ${email}:`, err.message);
      return res.status(500).json({ error: 'Chatworkへの送信に失敗しました: ' + err.message });
    }
  }

  // Fallback: no roomId configured - dev mode only
  logger.info(`Verification code for ${email}: ${code}`);
  res.json({
    success: true,
    message: 'コードを送信しました',
    devCode: process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

// POST /api/auth/verify-code - Verify code and login
router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'メールアドレスとコードを入力してください' });
  }

  const stored = verificationCodes.get(email);

  if (!stored) {
    return res.status(401).json({ error: 'コードが見つかりません。再度送信してください。' });
  }

  if (stored.expires < Date.now()) {
    verificationCodes.delete(email);
    return res.status(401).json({ error: 'コードの有効期限が切れました。再度送信してください。' });
  }

  if (stored.code !== code) {
    return res.status(401).json({ error: 'コードが間違っています' });
  }

  // Code is valid - create session
  verificationCodes.delete(email);

  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  sessions.set(sessionId, {
    email,
    userType: 'admin',
    expires: sessionExpires
  });

  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  res.json({ success: true, userType: 'admin', email });
});

// Session middleware
export function sessionMiddleware(req, res, next) {
  req.auth = { isAdmin: false, email: null };

  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const sessionCookie = cookies.find(c => c.startsWith(COOKIE_NAME + '='));

  if (sessionCookie) {
    const sessionId = sessionCookie.split('=')[1];
    req.sessionId = sessionId;
    const session = sessions.get(sessionId);

    if (session && session.expires > Date.now()) {
      req.auth.isAdmin = true;
      req.auth.email = session.email;
      req.isAdmin = true;
    }
  }
  next();
}

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionId) sessions.delete(req.sessionId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.auth.isAdmin) {
    return res.json({ loggedIn: true, userType: 'admin', email: req.auth.email });
  }
  res.json({ loggedIn: false });
});

export { COOKIE_NAME };
export default router;
