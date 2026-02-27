import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dropbox folders
const WATCH_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート';
const SUCCESS_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート完了';
const FAILED_FOLDER = 'D:\\JP Dropbox\\商品一覧\\メール2チャット\\インポート失敗';

// Database functions (import from project)
let getAllAccounts, createRule;

// Initialize database functions
async function initDatabase() {
  try {
    // Dynamically import database functions
    const dbModule = await import('../src/db/database.js');
    getAllAccounts = dbModule.getAllAccounts;
    createRule = dbModule.createRule;

    console.log('[Excel Auto Import] Database initialized');
  } catch (err) {
    console.error('[Excel Auto Import] Failed to initialize database:', err.message);
    process.exit(1);
  }
}

// Ensure folders exist
function ensureFolders() {
  [WATCH_FOLDER, SUCCESS_FOLDER, FAILED_FOLDER].forEach(folder => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      console.log(`[Excel Auto Import] Created folder: ${folder}`);
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

// Import Excel file
async function importExcelFile(filePath) {
  console.log(`[Excel Auto Import] Processing: ${path.basename(filePath)}`);

  try {
    // Read Excel file
    const buffer = fs.readFileSync(filePath);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    // Get all accounts for mapping
    const accounts = await getAllAccounts();

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        const name = row['ルール名'];
        const accountEmail = row['受信メールアドレス'] || '';
        const sender = row['相手メールアドレス'] || '';
        const subject = row['受信件名（部分一致）'] || row['受信件名(部分一致)'] || '';
        const roomId = row['チャットワークルームID'];

        if (!name || !name.toString().trim()) {
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
        if (accountEmail && accountEmail.toString().trim() && accountEmail.toString().trim() !== '全アカウント') {
          const account = accounts.find(a => a.username === accountEmail.toString().trim());
          if (account) {
            accountId = account.id;
          }
        }

        // Build conditions (AND search)
        const conditions = [];
        if (sender && sender.toString().trim()) {
          const senderConditions = parseSearchSyntax(sender.toString(), 'sender');
          conditions.push(...senderConditions);
        }
        if (subject && subject.toString().trim()) {
          const subjectConditions = parseSearchSyntax(subject.toString(), 'subject');
          conditions.push(...subjectConditions);
        }

        // Create rule
        await createRule({
          name: name.toString().trim(),
          enabled: 1,
          source: 'imap',
          account_id: accountId,
          match_type: 'all', // AND search
          conditions,
          chatwork_room_id: String(roomId).trim(),
          message_template: '件名：　{subject}\n\n内容：　{body}\n\n日時：　{date}\n\nアカウント：　{username}\n\nルール名：　{rule_name}',
          priority: 0,
        });

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${i + 2}行目: ${err.message}`);
      }
    }

    console.log(`[Excel Auto Import] Results: ${results.success} success, ${results.failed} failed`);

    // Move file based on results
    const fileName = path.basename(filePath);
    let targetFolder;

    if (results.failed === 0) {
      // All success - move to success folder
      targetFolder = SUCCESS_FOLDER;
      console.log(`[Excel Auto Import] ✓ All rows imported successfully`);
    } else {
      // Some failed - move to failed folder
      targetFolder = FAILED_FOLDER;
      console.log(`[Excel Auto Import] ✗ Some rows failed to import`);
      results.errors.forEach(err => console.log(`  - ${err}`));
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
    console.log(`[Excel Auto Import] Moved to: ${finalTargetPath}`);

    return results;
  } catch (err) {
    console.error(`[Excel Auto Import] Error processing file: ${err.message}`);

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
    console.log(`[Excel Auto Import] Moved to failed folder: ${finalTargetPath}`);

    throw err;
  }
}

// Process existing files in watch folder
async function processExistingFiles() {
  try {
    const files = fs.readdirSync(WATCH_FOLDER);
    const excelFiles = files.filter(f => /\.(xlsx|xls)$/i.test(f));

    if (excelFiles.length > 0) {
      console.log(`[Excel Auto Import] Found ${excelFiles.length} existing Excel files`);

      for (const file of excelFiles) {
        const filePath = path.join(WATCH_FOLDER, file);
        try {
          await importExcelFile(filePath);
        } catch (err) {
          console.error(`[Excel Auto Import] Failed to process ${file}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Excel Auto Import] Error processing existing files:', err.message);
  }
}

// Watch folder for new files
function startWatching() {
  console.log(`[Excel Auto Import] Watching folder: ${WATCH_FOLDER}`);

  // Use fs.watch for folder monitoring
  const watcher = fs.watch(WATCH_FOLDER, { persistent: true }, async (eventType, filename) => {
    if (!filename || !/\.(xlsx|xls)$/i.test(filename)) {
      return;
    }

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

        await importExcelFile(filePath);
      } catch (err) {
        console.error(`[Excel Auto Import] Error handling file ${filename}:`, err.message);
      }
    }, 2000); // Wait 2 seconds for file to be fully written
  });

  watcher.on('error', (err) => {
    console.error('[Excel Auto Import] Watcher error:', err.message);
  });

  console.log('[Excel Auto Import] Service started successfully');
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('[Excel Auto Import] Starting service...');
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
  console.error('[Excel Auto Import] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Excel Auto Import] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the service
main().catch(err => {
  console.error('[Excel Auto Import] Failed to start:', err);
  process.exit(1);
});
