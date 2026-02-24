import { getSession } from '../../db/database.js';

const COOKIE_NAME = 's2c_session';

export function sessionMiddleware(req, res, next) {
  // Initialize auth object
  req.auth = {
    isAdmin: false,
    isUser: false,
    userId: null,
    username: null
  };

  // Legacy support for old code
  req.isAdmin = false;

  const cookie = req.headers.cookie || '';
  const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));

  if (match) {
    const sessionId = match.split('=')[1];
    const session = getSession(sessionId);

    if (session) {
      req.sessionId = sessionId;

      if (session.user_type === 'admin') {
        req.auth.isAdmin = true;
        req.isAdmin = true; // Legacy support
      } else if (session.user_type === 'user') {
        req.auth.isUser = true;
        req.auth.userId = session.user_id;
        // Could optionally fetch username here if needed
      }
    }
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.isAdmin) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

export { COOKIE_NAME };
