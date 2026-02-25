import { getDb } from './database.sqlite.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

export function runMigrations() {
  const db = getDb();

  // First, migrate existing tables to add new columns if needed
  migrateExistingTables(db);

  // Then execute full schema (creates new tables and indexes)
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Ensure admin exists with default password
  const adminExists = db.prepare('SELECT id FROM admin WHERE id = 1').get();
  if (!adminExists) {
    const defaultPassword = 'admin123';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(defaultPassword, salt, 64).toString('hex');
    db.prepare('INSERT INTO admin (id, password_hash) VALUES (1, ?)').run(`${salt}:${hash}`);
    logger.info('Admin user created with default password: admin123');
  }

  logger.info('Database migrations completed');
}

function migrateExistingTables(db) {
  // Check if columns exist before adding them
  const checkColumn = (table, column) => {
    try {
      db.prepare(`SELECT ${column} FROM ${table} LIMIT 1`).all();
      return true;
    } catch {
      return false;
    }
  };

  // Add user_type and user_id to sessions if not exists
  if (!checkColumn('sessions', 'user_type')) {
    logger.info('Adding user_type column to sessions table');
    db.exec(`ALTER TABLE sessions ADD COLUMN user_type TEXT NOT NULL DEFAULT 'admin' CHECK(user_type IN ('admin', 'user'))`);
  }
  if (!checkColumn('sessions', 'user_id')) {
    logger.info('Adding user_id column to sessions table');
    db.exec(`ALTER TABLE sessions ADD COLUMN user_id INTEGER`);
  }

  // Add user_id to accounts if not exists
  if (!checkColumn('accounts', 'user_id')) {
    logger.info('Adding user_id column to accounts table');
    db.exec(`ALTER TABLE accounts ADD COLUMN user_id INTEGER`);
  }

  // Add user_id to rules if not exists
  if (!checkColumn('rules', 'user_id')) {
    logger.info('Adding user_id column to rules table');
    db.exec(`ALTER TABLE rules ADD COLUMN user_id INTEGER`);
  }

  logger.info('Table migrations completed');
}
