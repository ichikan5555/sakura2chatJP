import fs from 'fs';
import { config, loadSettings } from './config.js';
import { logger } from './logger.js';
import { createApp } from './web/server.js';

const NOTIFY_ROOM_ID = '253108411';

async function cleanupDuplicateRules() {
  try {
    const { getAllRules, deleteRule } = await import('./db/database.js');
    const { sendMessage } = await import('./chatwork/client.js');

    const rules = getAllRules();
    // account_id + conditions + chatwork_room_id で重複判定
    const seen = new Map();
    const duplicates = [];

    for (const rule of rules) {
      const key = `${rule.account_id || ''}|${rule.conditions}|${rule.chatwork_room_id}`;
      if (seen.has(key)) {
        duplicates.push(rule);
      } else {
        seen.set(key, rule);
      }
    }

    if (duplicates.length === 0) return;

    const lines = duplicates.map(r => `・${r.name} (ID:${r.id})`);
    for (const dup of duplicates) {
      deleteRule(dup.id);
    }

    logger.info(`Deleted ${duplicates.length} duplicate rule(s)`);

    const list = lines.slice(0, 20).join('\n');
    try {
      await sendMessage(NOTIFY_ROOM_ID, `[info][title]重複ルール削除[/title]${duplicates.length}件の重複ルールを削除しました。\n\n${list}${lines.length > 20 ? `\n... 他 ${lines.length - 20}件` : ''}[/info]`);
    } catch (err) {
      logger.error(`Failed to send duplicate notification: ${err.message}`);
    }
  } catch (err) {
    logger.error(`Duplicate rule cleanup error: ${err.message}`);
  }
}

async function main() {
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
    const { getAllSettings } = await import('./db/database.sqlite.js');

    runMigrations();
    loadSettings(getAllSettings);
    const allSettings = getAllSettings();
    logger.info(`Loaded ${Object.keys(allSettings).length} settings from DB: ${Object.keys(allSettings).join(', ')}`);
  }

  const app = createApp();
  const port = process.env.PORT || config.server.port;
  const host = process.env.RENDER || process.env.VERCEL ? '0.0.0.0' : (config.server.host || 'localhost');

  app.listen(port, host, () => {
    logger.info(`Web server listening on http://${host}:${port}`);

    // Note: Pollers are disabled in production (Vercel) as they require persistent connections
    if (!isProduction) {
      import('./imap/poller.js').then(({ startAllPollers }) => {
        startAllPollers();
      });

      // 重複ルールチェック（起動時 + 10分ごと）
      cleanupDuplicateRules();
      setInterval(cleanupDuplicateRules, 10 * 60 * 1000);
    }
  });
}

main().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
