import { ImapFlow } from 'imapflow';
import { logger } from '../logger.js';

// アカウント別のIMAPクライアント管理
const imapClients = new Map();

/**
 * パスワード導出（社内ルール対応）
 * mode=derive: ユーザー名から自動生成
 * mode=manual: 直接パスワードを使用
 */
function derivePassword(account) {
  if (account.password_mode === 'manual') {
    return account.password;
  }

  // derive モード: 社内ルールでパスワード生成
  const prefix = account.password_prefix || '';
  const suffix = account.password_suffix || '';

  // ユーザー名から local_part を抽出（@より前）
  const localPart = account.username.split('@')[0] || account.username;

  if (localPart.length === 0) {
    throw new Error('ユーザー名が不正です');
  }

  const firstChar = localPart[0];
  const lastChar = localPart[localPart.length - 1];
  const middle = `${firstChar}${lastChar}.`;

  const password = prefix + middle + suffix;

  if (!password) {
    throw new Error('パスワードを生成できませんでした（PREFIX/SUFFIXが未設定）');
  }

  return password;
}

/**
 * アカウントのIMAPクライアントを取得（シングルトン）
 */
export async function getImapClientForAccount(account) {
  const clientId = account.id;

  // 既存のクライアントが使用可能ならそれを返す
  if (imapClients.has(clientId)) {
    const client = imapClients.get(clientId);
    if (client.usable) {
      return client;
    } else {
      logger.warn(`IMAP client for account ${account.name} is not usable, reconnecting...`);
      await closeImapClientForAccount(clientId);
    }
  }

  // 新しいクライアントを作成
  const password = derivePassword(account);

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.username, pass: password },
    logger: false,
  });

  await client.connect();
  logger.info(`IMAP connected: ${account.username}@${account.host} (${account.name})`);

  imapClients.set(clientId, client);
  return client;
}

/**
 * 特定アカウントのIMAPクライアントを閉じる
 */
export async function closeImapClientForAccount(accountId) {
  if (imapClients.has(accountId)) {
    const client = imapClients.get(accountId);
    try {
      await client.logout();
      logger.info(`IMAP client for account ID ${accountId} logged out`);
    } catch (err) {
      logger.warn(`Failed to logout IMAP client for account ID ${accountId}`, err);
    }
    imapClients.delete(accountId);
  }
}

/**
 * 全てのIMAPクライアントを閉じる
 */
export async function closeAllImapClients() {
  for (const [accountId, client] of imapClients.entries()) {
    try {
      await client.logout();
      logger.info(`IMAP client for account ID ${accountId} logged out`);
    } catch (err) {
      logger.warn(`Failed to logout IMAP client for account ID ${accountId}`, err);
    }
  }
  imapClients.clear();
}

/**
 * IMAP接続テスト
 */
export async function testImapConnection(account) {
  try {
    const client = await getImapClientForAccount(account);
    const mailboxInfo = await client.getMailboxLock('INBOX');
    const exists = mailboxInfo.exists;
    mailboxInfo.release();
    logger.info(`IMAP connection test OK for ${account.name}: ${exists} messages in INBOX`);
    return { success: true, messageCount: exists };
  } catch (err) {
    logger.error(`IMAP connection test failed for ${account.name}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
