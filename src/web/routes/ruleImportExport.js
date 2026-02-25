import { Router } from 'express';
import { getAllRules, getAllAccounts, createRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';
import * as XLSX from 'xlsx';

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

// GET /api/rules/bulk/export-excel - Export rules as Excel
router.get('/export-excel', async (req, res) => {
  try {
    const rules = await getAllRules();
    const accounts = await getAllAccounts();

    const data = rules.map(rule => {
      let conditions;
      try {
        conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
      } catch {
        conditions = [];
      }

      let senderValue = '';
      let subjectValue = '';

      for (const cond of conditions) {
        if (cond.field === 'sender' && cond.operator === 'contains') {
          senderValue = cond.value;
        }
        if (cond.field === 'subject' && cond.operator === 'contains') {
          subjectValue = cond.value;
        }
      }

      const account = rule.account_id ? accounts.find(a => a.id === rule.account_id) : null;
      const accountUsername = account ? account.username : '全アカウント';

      return {
        'ルール名': rule.name,
        '受信メールアドレス': accountUsername,
        '相手メールアドレス': senderValue,
        '受信件名（部分一致）': subjectValue,
        'チャットワークルームID': rule.chatwork_room_id
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'ルール');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rules.xlsx"');
    res.send(buffer);
  } catch (err) {
    logger.error(`Excel export error: ${err.message}`);
    res.status(500).json({ error: 'エクスポートに失敗しました' });
  }
});

// POST /api/rules/bulk/import-excel - Import rules from Excel
router.post('/import-excel', async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'ファイルデータがありません' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

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

        if (!name || !name.trim()) {
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
        if (accountEmail && accountEmail.trim() && accountEmail.trim() !== '全アカウント') {
          const account = accounts.find(a => a.username === accountEmail.trim());
          if (account) {
            accountId = account.id;
          }
        }

        // Build conditions (AND search)
        const conditions = [];
        if (sender && sender.trim()) {
          const senderConditions = parseSearchSyntax(sender, 'sender');
          conditions.push(...senderConditions);
        }
        if (subject && subject.trim()) {
          const subjectConditions = parseSearchSyntax(subject, 'subject');
          conditions.push(...subjectConditions);
        }

        await createRule({
          name: name.trim(),
          enabled: 1,
          source: 'imap',
          account_id: accountId,
          match_type: 'all',
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

    logger.info(`Excel import: ${results.success} success, ${results.failed} failed`);
    res.json(results);
  } catch (err) {
    logger.error(`Excel import error: ${err.message}`);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

export default router;
