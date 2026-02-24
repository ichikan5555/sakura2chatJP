import { getDb } from './database.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

export function runMigrations() {
  const db = getDb();
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute schema
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
