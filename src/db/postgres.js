import pkg from 'pg';
const { Pool } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

/**
 * Initialize database (verify connection only)
 * Schema should be created manually in Supabase
 */
export async function initializeDatabase() {
  try {
    console.log('Verifying PostgreSQL database connection...');

    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection verified');

    // Create default admin user if not exists (with proper error handling)
    try {
      const adminCheck = await pool.query('SELECT id FROM admin WHERE id = 1');
      if (adminCheck.rows.length === 0) {
        const { scryptSync, randomBytes } = await import('crypto');
        const salt = randomBytes(16).toString('hex');
        const hash = scryptSync('admin123', salt, 64).toString('hex');
        const passwordHash = `${salt}:${hash}`;

        await pool.query('INSERT INTO admin (id, password_hash) VALUES (1, $1)', [passwordHash]);
        console.log('✅ Default admin user created (password: admin123)');
      } else {
        console.log('✅ Admin user already exists');
      }
    } catch (err) {
      console.warn('Admin user setup skipped:', err.message);
    }

    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    // Don't throw - allow app to start even if DB connection fails
  }
}

/**
 * Execute a query
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

/**
 * Get a client from the pool (for transactions)
 */
export async function getClient() {
  return await pool.getClient();
}

/**
 * Close all connections
 */
export async function closePool() {
  await pool.end();
  console.log('PostgreSQL pool closed');
}

export default pool;
