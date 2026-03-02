import { getImapClientForAccount, closeImapClientForAccount } from './auth.js';
import { parseMessage } from './parser.js';
import { getPollerState, updatePollerState, isEmailProcessed, recordProcessedEmail, getEnabledRules, getEnabledAccounts } from '../db/database.js';
import { matchRules } from '../rules/engine.js';
import { renderTemplate } from '../rules/template.js';
import { sendMessage } from '../chatwork/client.js';
import { logger } from '../logger.js';

// 監視速度の間隔（ミリ秒）
const POLL_INTERVALS = {
  high: 30 * 1000,   // 30秒
  normal: 60 * 1000, // 60秒
  slow: 90 * 1000,   // 90秒（1.5分）
};

// アカウント別のポーラータイマー
const pollerTimers = new Map();
const pollerStates = new Map(); // { isPolling, status, lastError }

export function getPollerStatusForAccount(accountId) {
  return pollerStates.get(accountId) || { status: 'stopped', lastError: null, isPolling: false };
}

export function getAllPollerStatus() {
  const statuses = {};
  for (const [accountId, state] of pollerStates.entries()) {
    statuses[accountId] = state;
  }
  return statuses;
}

export function startPollerForAccount(account) {
  const accountId = account.id;

  if (pollerTimers.has(accountId)) {
    logger.warn(`Poller for account ${account.name} is already running`);
    return;
  }

  const intervalMs = POLL_INTERVALS[account.poll_speed] || POLL_INTERVALS.normal;

  pollerStates.set(accountId, { status: 'running', lastError: null, isPolling: false });
  logger.info(`Poller started for account ${account.name} (${account.poll_speed}, ${intervalMs / 1000}s)`);

  // 即座に1回実行
  poll(account).catch(err => logger.error(`[${account.name}] Initial poll error:`, err));

  const timer = setInterval(() => poll(account).catch(err => logger.error(`[${account.name}] Poll error:`, err)), intervalMs);
  pollerTimers.set(accountId, timer);
}

export function stopPollerForAccount(accountId) {
  if (pollerTimers.has(accountId)) {
    clearInterval(pollerTimers.get(accountId));
    pollerTimers.delete(accountId);
    const state = pollerStates.get(accountId);
    if (state) state.status = 'stopped';
    logger.info(`Poller stopped for account ID ${accountId}`);
  }
}

export function restartPollerForAccount(account) {
  stopPollerForAccount(account.id);
  startPollerForAccount(account);
}

export async function startAllPollers() {
  const accounts = await getEnabledAccounts();
  for (const account of accounts) {
    startPollerForAccount(account);
  }
  logger.info(`Started ${accounts.length} poller(s)`);
}

export function stopAllPollers() {
  for (const accountId of pollerTimers.keys()) {
    stopPollerForAccount(accountId);
  }
  logger.info('All pollers stopped');
}

// スパムフォルダ名の候補（アカウントごとにキャッシュ）
const SPAM_FOLDER_CANDIDATES = ['[Gmail]/迷惑メール', '[Gmail]/Spam', 'Junk', 'Spam'];
const spamFolderCache = new Map(); // accountId → folderName or null

async function detectSpamFolder(client, accountId) {
  if (spamFolderCache.has(accountId)) return spamFolderCache.get(accountId);
  for (const folder of SPAM_FOLDER_CANDIDATES) {
    try {
      const lock = await client.getMailboxLock(folder);
      lock.release();
      spamFolderCache.set(accountId, folder);
      return folder;
    } catch { /* folder doesn't exist */ }
  }
  spamFolderCache.set(accountId, null);
  return null;
}

async function poll(account) {
  const accountId = account.id;
  const state = pollerStates.get(accountId);

  if (state.isPolling) return; // 前回のポーリングがまだ終わっていない
  state.isPolling = true;

  try {
    const client = await getImapClientForAccount(account);
    // NOOPで新着メール通知を受け取り、メールボックス状態を更新
    try { await client.noop(); } catch {}

    // ルール未設定ならメール取得自体をスキップ（last_uidを更新しない）
    const rules = await getEnabledRules('imap', accountId);
    if (rules.length === 0) {
      logger.warn(`[${account.name}] No enabled rules found, skipping poll (last_uid preserved)`);
      state.lastError = null;
      state.status = 'running';
      return;
    }

    // INBOX をポーリング
    await pollFolder(client, account, 'INBOX', 'last_uid', '', rules);

    // スパムフォルダをポーリング
    const spamFolder = await detectSpamFolder(client, accountId);
    if (spamFolder) {
      await pollFolder(client, account, spamFolder, 'last_spam_uid', 'SPAM:', rules);
    }

    state.lastError = null;
    state.status = 'running';
  } catch (err) {
    state.lastError = err.message;
    state.status = 'error';
    logger.error(`[${account.name}] Poll error: ${err.message}`);
    // 接続エラーの場合、クライアントをリセットして次回再接続
    if (err.code === 'ETIMEOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.message.includes('Socket') || err.message.includes('closed')) {
      logger.info(`[${account.name}] Resetting IMAP connection for next poll`);
      await closeImapClientForAccount(account.id).catch(() => {});
    }
  } finally {
    state.isPolling = false;
  }
}

async function pollFolder(client, account, folderName, lastUidKey, uidPrefix, rules) {
  const accountId = account.id;
  const lock = await client.getMailboxLock(folderName);

  try {
    const pollerState = await getPollerState(accountId);
    let lastUid = pollerState?.[lastUidKey] || 0;

    // 初回起動時: 過去メールをスキップし、現在の最新UIDを基準にする
    if (lastUid === 0) {
      const status = client.mailbox;
      let currentUidNext = status?.uidNext;

      // uidNextが取得できない場合、最後のメールのUIDを取得
      if (!currentUidNext && status?.exists > 0) {
        logger.info(`[${account.name}][${folderName}] uidNext not available, fetching last message UID`);
        const lastMessages = [];
        for await (const msg of client.fetch('*', { uid: true })) {
          lastMessages.push(msg);
          if (lastMessages.length >= 1) break;
        }
        if (lastMessages.length > 0) {
          currentUidNext = lastMessages[0].uid + 1;
          logger.info(`[${account.name}][${folderName}] Last message UID: ${lastMessages[0].uid}, setting uidNext to ${currentUidNext}`);
        }
      }

      if (currentUidNext && currentUidNext > 1) {
        lastUid = currentUidNext - 1;
        logger.info(`[${account.name}][${folderName}] First run: skipping past emails, setting ${lastUidKey} to ${lastUid}`);
        await updatePollerState(accountId, { [lastUidKey]: lastUid, last_poll_at: new Date().toISOString() });
      }
    }

    // lastUid以降の新着メールを取得
    const messages = [];
    for await (const message of client.fetch({ uid: `${lastUid + 1}:*` }, { envelope: true, source: true })) {
      messages.push(message);
    }

    const folderLabel = folderName === 'INBOX' ? '' : `[${folderName}] `;
    logger.info(`[${account.name}] ${folderLabel}Poll found ${messages.length} new message(s)`);

    let maxUid = lastUid;

    for (const msg of messages) {
      const uid = msg.uid;
      if (uid <= lastUid) continue; // IMAP *範囲が古いメールを返すことがある
      if (uid > maxUid) maxUid = uid;

      const recordUid = uidPrefix + String(uid);
      if (await isEmailProcessed(accountId, recordUid)) continue;

      await processMessage(account, msg, rules, uidPrefix);
    }

    // 最新UIDを保存
    if (maxUid > lastUid) {
      await updatePollerState(accountId, { [lastUidKey]: maxUid, last_poll_at: new Date().toISOString() });
    } else {
      await updatePollerState(accountId, { last_poll_at: new Date().toISOString() });
    }
  } finally {
    lock.release();
  }
}

async function processMessage(account, message, rules, uidPrefix = '') {
  const accountId = account.id;
  const uid = uidPrefix + String(message.uid);

  try {
    const parsed = await parseMessage(message.envelope, message.source);
    parsed.accountEmail = account.username;
    const matchedRules = matchRules(rules, parsed);

    if (matchedRules.length === 0) {
      await recordProcessedEmail({
        account_id: accountId,
        imap_uid: uid,
        rule_id: null,
        sender: parsed.senderEmail,
        subject: parsed.subject,
        status: 'skipped'
      });
      return;
    }

    const sentRooms = new Set();
    for (const rule of matchedRules) {
      const roomId = String(rule.chatwork_room_id);
      if (sentRooms.has(roomId)) {
        logger.info(`[${account.name}] Skip duplicate room ${roomId} for UID ${uid}`);
        continue;
      }
      const messageText = renderTemplate(rule.message_template, parsed, rule);
      try {
        await sendMessage(rule.chatwork_room_id, messageText);
        sentRooms.add(roomId);
        await recordProcessedEmail({
          account_id: accountId,
          imap_uid: uid,
          rule_id: rule.id,
          sender: parsed.senderEmail,
          subject: parsed.subject,
          status: 'sent',
          chatwork_room_id: rule.chatwork_room_id
        });
        logger.info(`[${account.name}] Forwarded to room ${rule.chatwork_room_id}: ${parsed.subject}`);
      } catch (err) {
        await recordProcessedEmail({
          account_id: accountId,
          imap_uid: uid,
          rule_id: rule.id,
          sender: parsed.senderEmail,
          subject: parsed.subject,
          status: 'failed',
          error_message: err.message,
          chatwork_room_id: rule.chatwork_room_id
        });
        logger.error(`[${account.name}] Failed to forward: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[${account.name}] Failed to process UID ${uid}: ${err.message}`);
    await recordProcessedEmail({
      account_id: accountId,
      imap_uid: uid,
      rule_id: null,
      sender: null,
      subject: null,
      status: 'failed',
      error_message: err.message
    });
  }
}
