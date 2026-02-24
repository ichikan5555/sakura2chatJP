import express from 'express';
import path from 'path';
import { config } from '../config.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './middleware/errorHandler.js';
import rulesRouter from './routes/rules.js';
import statusRouter from './routes/status.js';
import logsRouter from './routes/logs.js';
import authRouter from './routes/auth.js';
import chatworkRouter from './routes/chatwork.js';
import settingsRouter from './routes/settings.js';
import ruleImportExportRouter from './routes/ruleImportExport.js';
import accountsRouter from './routes/accounts.js';
import adminUsersRouter from './routes/admin/users.js';
import adminMonitorRouter from './routes/admin/monitor.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessionMiddleware);
  app.use(express.static(path.join(config.projectRoot, 'public')));

  app.use('/api/auth', authRouter);
  app.use('/auth', authRouter);
  app.use('/api/rules/bulk', ruleImportExportRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/status', statusRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/chatwork', chatworkRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/accounts', accountsRouter);

  // Admin routes
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin/monitor', adminMonitorRouter);

  app.use(errorHandler);
  return app;
}
