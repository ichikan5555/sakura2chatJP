import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dropbox folders
const WATCH_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート';
const SUCCESS_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート完了';
const FAILED_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート失敗';

// Database functions (import from project)
let getAllAccounts, createRule, createAccount;
let sendMessage, startPollerForAccount, testImapConnection;

const NOTIFY_ROOM_ID = '253108411';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function notifyInfo(message) {
  try {
    if (!sendMessage) return;
    await sendMessage(NOTIFY_ROOM_ID, message);
    await sleep(1500);
  } catch (err) {
    console.error(`[CSV Auto Import] Failed to send notification: ${err.message}`);
  }
}

const notifyError = notifyInfo;

// Initialize database functions
async function initDatabase() {
  try {
    // Dynamically import database functions
    const dbModule = await import('../src/db/database.js');
    getAllAccounts = dbModule.getAllAccounts;
    createRule = dbModule.createRule;
    createAccount = dbModule.createAccount;

    const cwModule = await import('../src/chatwork/client.js');
    sendMessage = cwModule.sendMessage;

    const pollerModule = await import('../src/imap/poller.js');
    startPollerForAccount = pollerModule.startPollerForAccount;

    const authModule = await import('../src/imap/auth.js');
    testImapConnection = authModule.testImapConnection;

    console.log('[CSV Auto Import] Database initialized');
  } catch (err) {
    console.error('[CSV Auto Import] Failed to initialize database:', err.message);
    process.exit(1);
  }
}

// Ensure folders exist
function ensureFolders() {
  [WATCH_FOLDER, SUCCESS_FOLDER, FAILED_FOLDER].forEach(folder => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      console.log(`[CSV Auto Import] Created folder: ${folder}`);
    }
  });
}

// Parse search syntax (copied from ruleImportExport.js)
function parseSearchSyntax(text, defaultField = 'sender') {
  const conditions = [];

  // Split by space or comma
  const parts = text.split(/[,\s]+/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith('NOT:')) {
      // NOT syntax
      const value = part.substring(4).trim();
      if (value) {
        conditions.push({
          field: defaultField,
          operator: 'not_contains',
          value: value,
        });
      }
    } else {
      // Normal contains or domain
      if (part) {
        const operator = part.includes('@') ? 'contains' :
                        (part.includes('.') && defaultField === 'sender') ? 'domain' : 'contains';
        conditions.push({
          field: defaultField,
          operator: operator,
          value: part,
        });
      }
    }
  }

  return conditions;
}

// CSV line parser (handles quoted fields)
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// Import CSV file
async function importCsvFile(filePath) {
  console.log(`[CSV Auto Import] Processing: ${path.basename(filePath)}`);

  try {
    // Read CSV file
    let text = fs.readFileSync(filePath, 'utf-8');
    // Remove BOM
    text = text.replace(/^\uFEFF/, '');

    const lines = text.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      throw new Error('CSV file has no data rows');
    }

    // Skip header row
    const dataLines = lines.slice(1);

    // Get all accounts for mapping
    const accounts = await getAllAccounts();

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < dataLines.length; i++) {
      const fields = parseCsvLine(dataLines[i]);

      try {
        const name = (fields[0] || '').trim();
        const accountEmail = (fields[1] || '').trim();
        const sender = (fields[2] || '').trim();
        const senderExclude = (fields[3] || '').trim();
        const subject = (fields[4] || '').trim();
        const subjectExclude = (fields[5] || '').trim();
        const roomId = (fields[6] || '').trim();

        if (!name) {
          results.failed++;
          results.errors.push(`${i + 2}行目: ルール名が必要です`);
          continue;
        }

        if (!roomId) {
          results.failed++;
          results.errors.push(`${i + 2}行目: チャットワークルームIDが必要です`);
          continue;
        }

        // Find account by email
        let accountId = null;
        if (accountEmail && accountEmail !== '全アカウント') {
          let account = accounts.find(a => a.username === accountEmail);

          // monoshare.jp の未登録アカウントは自動登録
          if (!account && accountEmail.endsWith('@monoshare.jp')) {
            const newAccount = await createAccount({
              name: accountEmail,
              enabled: 1,
              host: 'monoshare.sakura.ne.jp',
              port: 993,
              username: accountEmail,
              password_mode: 'derive',
              password_prefix: 'araki0404.',
              password_suffix: 'junpei0822.',
              poll_speed: 'normal',
            });
            accounts.push(newAccount);
            console.log(`[CSV Auto Import] Auto-registered account ${accountEmail} (ID: ${newAccount.id})`);

            await notifyInfo(`[info][title]アカウント自動登録[/title]「${accountEmail}」は未登録のため新規登録しました。\n接続テストを実行します...[/info]`);

            // 接続テスト
            if (testImapConnection) {
              const testResult = await testImapConnection(newAccount);
              if (testResult.success) {
                await notifyInfo(`[info][title]接続テスト成功[/title]「${accountEmail}」の接続テストに成功しました。\nメッセージ数: ${testResult.messageCount}\nメール監視を開始します。[/info]`);
                if (startPollerForAccount) startPollerForAccount(newAccount);
              } else {
                await notifyError(`[info][title]接続テスト失敗[/title]「${accountEmail}」の接続テストに失敗しました。\nエラー: ${testResult.error}\n\nアカウント管理画面で設定を確認してください。[/info]`);
              }
            }

            account = newAccount;
          }

          if (account) {
            accountId = account.id;
          }
        }

        // 対象アカウント必須
        if (!accountId) {
          const reason = accountEmail ? `「${accountEmail}」は未登録のアカウントです` : '受信メールアドレスが空です';
          results.failed++;
          results.errors.push(`${i + 2}行目: ${reason}`);
          continue;
        }

        // Build conditions (AND search)
        const conditions = [];
        if (sender) {
          const senderConditions = parseSearchSyntax(sender, 'sender');
          conditions.push(...senderConditions);
        }
        if (senderExclude) {
          conditions.push({ field: 'sender', operator: 'not_contains', value: senderExclude });
        }
        if (subject) {
          const subjectConditions = parseSearchSyntax(subject, 'subject');
          conditions.push(...subjectConditions);
        }
        if (subjectExclude) {
          conditions.push({ field: 'subject', operator: 'not_contains', value: subjectExclude });
        }

        // Create rule
        await createRule({
          name: name,
          enabled: 1,
          source: 'imap',
          account_id: accountId,
          match_type: 'all', // AND search
          conditions,
          chatwork_room_id: roomId,
          message_template: '件名：　{subject}\n\n内容：　{body}\n\n日時：　{date}\n\nアカウント：　{username}\n\nルール名：　{rule_name}',
          priority: 0,
        });

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${i + 2}行目: ${err.message}`);
      }
    }

    console.log(`[CSV Auto Import] Results: ${results.success} success, ${results.failed} failed`);

    // Move file based on results
    const fileName = path.basename(filePath);
    let targetFolder;

    if (results.failed === 0) {
      // All success - move to success folder
      targetFolder = SUCCESS_FOLDER;
      console.log(`[CSV Auto Import] ✓ All rows imported successfully`);
      if (results.success > 0) {
        await notifyInfo(`[info][title]CSV自動インポート完了[/title]ファイル: ${path.basename(filePath)}\n${results.success}件のルールを登録しました。[/info]`);
      }
    } else {
      // Some failed - move to failed folder
      targetFolder = FAILED_FOLDER;
      console.log(`[CSV Auto Import] ✗ Some rows failed to import`);
      results.errors.forEach(err => console.log(`  - ${err}`));

      const errorList = results.errors.slice(0, 10).join('\n');
      await notifyError(`[info][title]CSV自動インポート エラー[/title]ファイル: ${path.basename(filePath)}\n成功: ${results.success}件 / 失敗: ${results.failed}件\n\n${errorList}${results.errors.length > 10 ? `\n... 他 ${results.errors.length - 10}件` : ''}[/info]`);
    }

    const targetPath = path.join(targetFolder, fileName);

    // If target file exists, add timestamp
    let finalTargetPath = targetPath;
    if (fs.existsSync(finalTargetPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      finalTargetPath = path.join(targetFolder, `${baseName}_${timestamp}${ext}`);
    }

    fs.renameSync(filePath, finalTargetPath);
    console.log(`[CSV Auto Import] Moved to: ${finalTargetPath}`);

    return results;
  } catch (err) {
    console.error(`[CSV Auto Import] Error processing file: ${err.message}`);

    // Move to failed folder
    const fileName = path.basename(filePath);
    const targetPath = path.join(FAILED_FOLDER, fileName);

    let finalTargetPath = targetPath;
    if (fs.existsSync(finalTargetPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      finalTargetPath = path.join(FAILED_FOLDER, `${baseName}_${timestamp}${ext}`);
    }

    fs.renameSync(filePath, finalTargetPath);
    console.log(`[CSV Auto Import] Moved to failed folder: ${finalTargetPath}`);

    await notifyError(`[info][title]CSV自動インポート エラー[/title]ファイル: ${path.basename(filePath)}\n${err.message}[/info]`);

    throw err;
  }
}

// Process existing files in watch folder
async function processExistingFiles() {
  try {
    const files = fs.readdirSync(WATCH_FOLDER);
    const csvFiles = files.filter(f => /\.csv$/i.test(f));

    if (csvFiles.length > 0) {
      console.log(`[CSV Auto Import] Found ${csvFiles.length} existing CSV files`);

      for (const file of csvFiles) {
        const filePath = path.join(WATCH_FOLDER, file);
        try {
          await importCsvFile(filePath);
        } catch (err) {
          console.error(`[CSV Auto Import] Failed to process ${file}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[CSV Auto Import] Error processing existing files:', err.message);
  }
}

// Watch folder for new files
const processingFiles = new Set(); // 二重処理防止

function startWatching() {
  console.log(`[CSV Auto Import] Watching folder: ${WATCH_FOLDER}`);

  // Use fs.watch for folder monitoring
  const watcher = fs.watch(WATCH_FOLDER, { persistent: true }, async (eventType, filename) => {
    if (!filename || !/\.csv$/i.test(filename)) {
      return;
    }

    // 同じファイルの二重処理を防止
    if (processingFiles.has(filename)) {
      return;
    }
    processingFiles.add(filename);

    const filePath = path.join(WATCH_FOLDER, filename);

    // Wait a bit to ensure file is fully written
    setTimeout(async () => {
      try {
        // Check if file still exists (might have been already processed)
        if (!fs.existsSync(filePath)) {
          return;
        }

        // Check if file is readable (not being written)
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          return; // File is still being written
        }

        await importCsvFile(filePath);
      } catch (err) {
        console.error(`[CSV Auto Import] Error handling file ${filename}:`, err.message);
      } finally {
        processingFiles.delete(filename);
      }
    }, 2000); // Wait 2 seconds for file to be fully written
  });

  watcher.on('error', (err) => {
    console.error('[CSV Auto Import] Watcher error:', err.message);
  });

  console.log('[CSV Auto Import] Service started successfully');
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('[CSV Auto Import] Starting service...');
  console.log('='.repeat(60));

  // Initialize
  ensureFolders();
  await initDatabase();

  // Process existing files first
  await processExistingFiles();

  // Start watching for new files
  startWatching();
}

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('[CSV Auto Import] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CSV Auto Import] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the service
main().catch(err => {
  console.error('[CSV Auto Import] Failed to start:', err);
  process.exit(1);
});
