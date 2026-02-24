// Vercel serverless function entry point
import { initializeDatabase } from '../src/db/postgres.js';
import { createApp } from '../src/web/server.js';

// Initialize database (only once)
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized && process.env.DATABASE_URL) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

// Create app
const app = createApp();

// Middleware to ensure DB is initialized
app.use(async (req, res, next) => {
  await ensureDbInitialized();
  next();
});

// Export for Vercel
export default app;
