/**
 * Authorization middleware for multi-user system
 */

export function requireAdmin(req, res, next) {
  if (!req.auth || !req.auth.isAdmin) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.auth || !req.auth.isUser) {
    return res.status(403).json({ error: 'ユーザーログインが必要です' });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth || (!req.auth.isAdmin && !req.auth.isUser)) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  next();
}

/**
 * Check if user owns the resource or is admin
 */
export function requireOwnerOrAdmin(getOwnerId) {
  return (req, res, next) => {
    if (req.auth.isAdmin) {
      return next();
    }

    const ownerId = getOwnerId(req);
    if (req.auth.userId !== ownerId) {
      return res.status(403).json({ error: 'アクセス権限がありません' });
    }
    next();
  };
}
