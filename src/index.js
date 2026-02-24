import fs from 'fs';
import { config, loadSettings } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { getAllSettings } from './db/database.js';
import { createApp } from './web/server.js';
import { startAllPollers } from './imap/poller.js';

fs.mkdirSync(config.db.path.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
fs.mkdirSync(config.credentials.dir, { recursive: true });

runMigrations();
loadSettings(getAllSettings);
const allSettings = getAllSettings();
logger.info(`Loaded ${Object.keys(allSettings).length} settings from DB: ${Object.keys(allSettings).join(', ')}`);

const app = createApp();
app.listen(config.server.port, config.server.host, () => {
  logger.info(`Web server listening on http://${config.server.host}:${config.server.port}`);

  // 有効なアカウントの全ポーラーを起動
  startAllPollers();
});
