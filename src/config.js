import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.resolve(projectRoot, process.env.LOG_DIR || './logs'),
  },
  db: {
    path: path.resolve(projectRoot, process.env.DB_PATH || './data/sakura2chat.db'),
  },
  credentials: {
    dir: path.resolve(projectRoot, process.env.CREDENTIALS_DIR || './credentials'),
  },
  projectRoot,
};

// DB settings cache
let _settings = null;

export function loadSettings(getAllSettings) {
  _settings = getAllSettings();
}

export function reloadSettings(getAllSettings) {
  _settings = getAllSettings();
}

/** Get setting: DB > .env > default */
export function setting(key, fallbackDefault = '') {
  if (_settings && key in _settings) return _settings[key];
  const envMap = {
    'imap.host': 'IMAP_HOST',
    'imap.port': 'IMAP_PORT',
    'imap.user': 'IMAP_USER',
    'imap.password': 'IMAP_PASSWORD',
    'chatwork.apiToken': 'CHATWORK_API_TOKEN',
    'polling.intervalSec': 'POLL_INTERVAL_SEC',
    'password.mode': 'PASSWORD_MODE',
    'password.prefix': 'PASSWORD_PREFIX',
    'password.suffix': 'PASSWORD_SUFFIX',
  };
  const envKey = envMap[key];
  if (envKey && process.env[envKey]) return process.env[envKey];
  const defaults = {
    'imap.host': 'monoshare.sakura.ne.jp',
    'imap.port': '993',
    'polling.intervalSec': '60',
    'password.mode': 'manual',
  };
  return defaults[key] || fallbackDefault;
}
