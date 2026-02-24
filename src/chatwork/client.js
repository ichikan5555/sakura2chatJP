import { setting } from '../config.js';
import { logger } from '../logger.js';

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';
const RATE_LIMIT_WAIT_MS = 60_000;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 500;

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  lastRequestTime = Date.now();
}

export async function sendMessage(roomId, body) {
  const token = setting('chatwork.apiToken');
  if (!token) throw new Error('Chatwork APIトークンが未設定');
  await throttle();
  const url = `${CHATWORK_API_BASE}/rooms/${roomId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-ChatWorkToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ body, self_unread: '0' }),
  });
  if (res.status === 429) {
    logger.warn(`Chatwork rate limited, retrying in ${RATE_LIMIT_WAIT_MS / 1000}s`);
    await sleep(RATE_LIMIT_WAIT_MS);
    await throttle();
    const retry = await fetch(url, {
      method: 'POST',
      headers: { 'X-ChatWorkToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ body, self_unread: '0' }),
    });
    if (!retry.ok) { const t = await retry.text(); throw new Error(`Chatwork API error (retry) ${retry.status}: ${t}`); }
    return retry.json();
  }
  if (!res.ok) { const t = await res.text(); throw new Error(`Chatwork API error ${res.status}: ${t}`); }
  return res.json();
}

export async function getRooms() {
  const token = setting('chatwork.apiToken');
  if (!token) throw new Error('Chatwork APIトークンが未設定');
  await throttle();
  const res = await fetch(`${CHATWORK_API_BASE}/rooms`, { headers: { 'X-ChatWorkToken': token } });
  if (!res.ok) { const t = await res.text(); throw new Error(`Chatwork API error ${res.status}: ${t}`); }
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
