import fs from 'fs';
import { config, loadSettings } from './config.js';
import { logger } from './logger.js';
import { createApp } from './web/server.js';

const isProduction = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;

// Initialize database based on environment
if (isProduction) {
  // PostgreSQL (Vercel/Production)
  logger.info('Using PostgreSQL database');
  const { initializeDatabase } = await import('./db/postgres.js');
  await initializeDatabase();
} else {
  // SQLite (Local development)
  logger.info('Using SQLite database');
  fs.mkdirSync(config.db.path.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  fs.mkdirSync(config.credentials.dir, { recursive: true });

  const { runMigrations } = await import('./db/migrate.js');
  const { getAllSettings } = await import('./db/database.js');

  runMigrations();
  loadSettings(getAllSettings);
  const allSettings = getAllSettings();
  logger.info(`Loaded ${Object.keys(allSettings).length} settings from DB: ${Object.keys(allSettings).join(', ')}`);
}

const app = createApp();
const port = process.env.PORT || config.server.port;
const host = process.env.VERCEL ? '0.0.0.0' : config.server.host;

app.listen(port, host, () => {
  logger.info(`Web server listening on http://${host}:${port}`);

  // Note: Pollers are disabled in production (Vercel) as they require persistent connections
  if (!isProduction) {
    const { startAllPollers } = await import('./imap/poller.js');
    startAllPollers();
  }
});
