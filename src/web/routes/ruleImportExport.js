import { Router } from 'express';
import { getAllRules, getAllAccounts, createRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';
import { sendMessage } from '../../chatwork/client.js';

const NOTIFY_ROOM_ID = '253108411';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function notifyInfo(message) {
  try {
    await sendMessage(NOTIFY_ROOM_ID, message);
    await sleep(1500);
  } catch (err) {
    logger.error(`Failed to send notification: ${err.message}`);
  }
}

const notifyError = notifyInfo;

const router = Router();
router.use(requireAuth);

// Parse search syntax (from:, subject:, etc.)
function parseSearchSyntax(fieldValue, defaultField) {
  const conditions = [];
  const trimmed = fieldValue.trim();

  // Split by comma (for multiple conditions)
  const parts = trimmed.split(',').map(p => p.trim()).filter(p => p);

  for (const part of parts) {
    // Check for search syntax
    const fromMatch = part.match(/^from:\s*(.+)$/i);
    const subjectMatch = part.match(/^subject:\s*(.+)$/i);

    if (fromMatch) {
      const value = fromMatch[1].trim();
      if (value.includes('@') && !value.startsWith('@')) {
        conditions.push({ field: 'sender', operator: 'contains', value });
      } else if (value.includes('.')) {
        conditions.push({ field: 'sender', operator: 'domain', value: value.replace(/^@/, '') });
      } else {
        conditions.push({ field: 'sender', operator: 'contains', value });
      }
    } else if (subjectMatch) {
      conditions.push({ field: 'subject', operator: 'contains', value: subjectMatch[1].trim() });
    } else {
      if (part) {
        const operator = part.includes('@') ? 'contains' :
                        (part.includes('.') && defaultField === 'sender') ? 'domain' : 'contains';
        conditions.push({ field: defaultField, operator, value: part });
      }
    }
  }

  return conditions;
}

// CSV helpers
function escapeCsvField(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

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

const CSV_HEADERS = ['ルール名', '受信メールアドレス', '相手メールアドレス', '相手メール除外', '受信件名（部分一致）', '件名除外', 'チャットワークルームID'];

// GET /api/rules/bulk/export-csv - Export rules as CSV
router.get('/export-csv', async (req, res) => {
  try {
    const rules = await getAllRules();
    const accounts = await getAllAccounts();

    const rows = rules.map(rule => {
      let conditions;
      try {
        conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
      } catch {
        conditions = [];
      }

      let senderValue = '';
      let senderExclude = '';
      let subjectValue = '';
      let subjectExclude = '';

      for (const cond of conditions) {
        if (cond.field === 'sender' && cond.operator === 'contains') {
          senderValue = cond.value;
        }
        if (cond.field === 'sender' && cond.operator === 'not_contains') {
          senderExclude = cond.value;
        }
        if (cond.field === 'subject' && cond.operator === 'contains') {
          subjectValue = cond.value;
        }
        if (cond.field === 'subject' && cond.operator === 'not_contains') {
          subjectExclude = cond.value;
        }
      }

      const account = rule.account_id ? accounts.find(a => a.id === rule.account_id) : null;
      const accountUsername = account ? account.username : '全アカウント';

      return [rule.name, accountUsername, senderValue, senderExclude, subjectValue, subjectExclude, rule.chatwork_room_id]
        .map(escapeCsvField).join(',');
    });

    const csv = '\uFEFF' + CSV_HEADERS.map(escapeCsvField).join(',') + '\n' + rows.join('\n') + '\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rules.csv"');
    res.send(csv);
  } catch (err) {
    logger.error(`CSV export error: ${err.message}`);
    res.status(500).json({ error: 'エクスポートに失敗しました' });
  }
});

// POST /api/rules/bulk/import-csv - Import rules from CSV
router.post('/import-csv', async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'CSVデータがありません' });
    }

    // Remove BOM and split lines
    const text = csvText.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'データ行がありません' });
    }

    // Skip header row
    const dataLines = lines.slice(1);
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

        // Find account by email (アカウント未登録ならエラー)
        let accountId = null;
        if (accountEmail && accountEmail !== '全アカウント') {
          const account = accounts.find(a => a.username === accountEmail);
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

        await createRule({
          name,
          enabled: 1,
          source: 'imap',
          account_id: accountId,
          match_type: 'all',
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

    logger.info(`CSV import: ${results.success} success, ${results.failed} failed`);

    if (results.failed > 0) {
      const errorList = results.errors.slice(0, 10).join('\n');
      await notifyError(`[info][title]CSVインポート結果[/title]成功: ${results.success}件 / 失敗: ${results.failed}件\n\n${errorList}${results.errors.length > 10 ? `\n... 他 ${results.errors.length - 10}件` : ''}[/info]`);
    } else if (results.success > 0) {
      await notifyInfo(`[info][title]CSVインポート完了[/title]${results.success}件のルールを登録しました。[/info]`);
    }

    res.json(results);
  } catch (err) {
    logger.error(`CSV import error: ${err.message}`);
    await notifyError(`[info][title]CSVインポート エラー[/title]${err.message}[/info]`);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

export default router;
