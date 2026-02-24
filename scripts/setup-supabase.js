import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Read schema
    const schemaPath = join(__dirname, '../src/db/schema.postgres.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    console.log('Executing schema...');
    await client.query(schema);
    console.log('✅ Tables created successfully');

    // Create default admin user
    console.log('Creating default admin user...');
    const { randomBytes, scryptSync } = await import('crypto');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('admin123', salt, 64).toString('hex');
    const passwordHash = `${salt}:${hash}`;

    await client.query(
      'INSERT INTO admin (id, password_hash) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [passwordHash]
    );
    console.log('✅ Default admin created (password: admin123)');

    console.log('\n🎉 Database setup complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

setupDatabase();
