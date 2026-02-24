import { getSession } from '../../db/database.js';

const COOKIE_NAME = 's2c_session';

export function sessionMiddleware(req, res, next) {
  req.isAdmin = false;
  const cookie = req.headers.cookie || '';
  const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (match) {
    const sessionId = match.split('=')[1];
    const session = getSession(sessionId);
    if (session) {
      req.isAdmin = true;
      req.sessionId = sessionId;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.isAdmin) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

export { COOKIE_NAME };
