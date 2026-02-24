import { logger } from '../../logger.js';

export function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} - ${err.message}`, err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}
