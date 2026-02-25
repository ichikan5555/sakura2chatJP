export default function handler(req, res) {
  res.json({ message: 'Hello from Vercel!', timestamp: new Date().toISOString() });
}
