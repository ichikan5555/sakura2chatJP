import { getImapClientForAccount } from './auth.js';
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
  poll(account);

  const timer = setInterval(() => poll(account), intervalMs);
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

export function startAllPollers() {
  const accounts = getEnabledAccounts();
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

async function poll(account) {
  const accountId = account.id;
  const state = pollerStates.get(accountId);

  if (state.isPolling) return; // 前回のポーリングがまだ終わっていない
  state.isPolling = true;

  try {
    const client = await getImapClientForAccount(account);
    const lock = await client.getMailboxLock('INBOX');

    try {
      const pollerState = getPollerState(accountId);
      const lastUid = pollerState?.last_uid || 0;

      // lastUid以降の新着メールを取得
      const messages = [];
      for await (const message of client.fetch(`${lastUid + 1}:*`, { envelope: true, source: true })) {
        messages.push(message);
      }

      logger.info(`[${account.name}] Poll found ${messages.length} new message(s)`);

      const rules = getEnabledRules('imap', accountId);
      let maxUid = lastUid;

      for (const msg of messages) {
        const uid = msg.uid;
        if (uid > maxUid) maxUid = uid;

        if (isEmailProcessed(accountId, String(uid))) continue;

        await processMessage(account, msg, rules);
      }

      // 最新UIDを保存
      if (maxUid > lastUid) {
        updatePollerState(accountId, { last_uid: maxUid, last_poll_at: new Date().toISOString() });
      } else {
        updatePollerState(accountId, { last_poll_at: new Date().toISOString() });
      }

      state.lastError = null;
      state.status = 'running';
    } finally {
      lock.release();
    }
  } catch (err) {
    state.lastError = err.message;
    state.status = 'error';
    logger.error(`[${account.name}] Poll error: ${err.message}`, err);
  } finally {
    state.isPolling = false;
  }
}

async function processMessage(account, message, rules) {
  const accountId = account.id;
  const uid = String(message.uid);

  try {
    const parsed = await parseMessage(message.envelope, message.source);
    const matchedRules = matchRules(rules, parsed);

    if (matchedRules.length === 0) {
      recordProcessedEmail({
        account_id: accountId,
        imap_uid: uid,
        rule_id: null,
        sender: parsed.senderEmail,
        subject: parsed.subject,
        status: 'skipped'
      });
      return;
    }

    for (const rule of matchedRules) {
      const messageText = renderTemplate(rule.message_template, parsed, rule);
      try {
        await sendMessage(rule.chatwork_room_id, messageText);
        recordProcessedEmail({
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
        recordProcessedEmail({
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
    recordProcessedEmail({
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
