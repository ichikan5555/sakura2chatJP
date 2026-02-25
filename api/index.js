// Minimal Vercel serverless function
import express from 'express';

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Simple auth
const sessions = new Map();

app.post('/api/auth/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (password === adminPassword) {
    const sessionId = Math.random().toString(36).substring(7);
    sessions.set(sessionId, { type: 'admin' });
    res.setHeader('Set-Cookie', `s2c_session=${sessionId}; Path=/; HttpOnly; Max-Age=604800`);
    res.json({ success: true, userType: 'admin' });
  } else {
    res.status(401).json({ error: 'パスワードが間違っています' });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json({ loggedIn: false });
});

app.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth working!', env: process.env.ADMIN_PASSWORD ? 'set' : 'not set' });
});

export default app;
