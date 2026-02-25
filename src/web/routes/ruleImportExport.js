import { Router } from 'express';
import { getAllRules, getAllAccounts, createRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

// GET /api/rules/bulk/export - Export rules as CSV
router.get('/export', async (req, res) => {
  try {
    const rules = await getAllRules();

    // CSV header
    const header = 'ルール名,受信メールアドレス,相手メールアドレス,受信件名（部分一致）,チャットワークルームID\n';

    // Convert rules to CSV rows
    const rows = rules.map(rule => {
      let conditions;
      try {
        conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
      } catch {
        conditions = [];
      }

      // Extract sender and subject conditions
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

      // Escape CSV values (handle commas and quotes)
      const escape = (val) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return `${escape(rule.name)},${escape(senderValue)},${escape(subjectValue)},${escape(rule.chatwork_room_id)}`;
    }).join('\n');

    const csv = header + rows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rules.csv"');
    res.send('\uFEFF' + csv); // BOM for Excel compatibility
  } catch (err) {
    logger.error(`Export error: ${err.message}`);
    res.status(500).json({ error: 'エクスポートに失敗しました' });
  }
});

// POST /api/rules/bulk/import - Import rules from CSV
router.post('/import', async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'CSVデータがありません' });
    }

    // Parse CSV (supports multiline cells)
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSVデータが空です' });
    }

    // Skip header
    const dataRows = rows.slice(1);

    // Get all accounts for mapping
    const accounts = await getAllAccounts();

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row.length === 0 || row.every(cell => !cell || !cell.trim())) continue;

      try {
        // Log row structure for debugging
        logger.info(`Row ${i + 2}: ${row.length} columns - [${row.map(c => `"${c?.substring(0, 30)}..."`).join(', ')}]`);

        // New 5-column format: ルール名,受信メールアドレス,相手メールアドレス,受信件名（部分一致）,チャットワークルームID
        if (row.length < 5) {
          results.failed++;
          results.errors.push(`${i + 2}行目: 列が不足しています (${row.length}列、5列必要)`);
          continue;
        }

        const name = row[0];
        const accountEmail = row[1];
        const senderField = row[2];
        const subjectField = row[3];
        const roomId = row[4];

        if (!name || !name.trim()) {
          results.failed++;
          results.errors.push(`${i + 2}行目: ルール名が必要です`);
          continue;
        }

        if (!roomId || !roomId.trim()) {
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

        // Parse sender field
        if (senderField && senderField.trim()) {
          const senderConditions = parseSearchSyntax(senderField, 'sender');
          conditions.push(...senderConditions);
        }

        // Parse subject field
        if (subjectField && subjectField.trim()) {
          const subjectConditions = parseSearchSyntax(subjectField, 'subject');
          conditions.push(...subjectConditions);
        }

        // Create rule
        await createRule({
          name: name.trim(),
          enabled: 1,
          source: 'imap',
          account_id: accountId,
          match_type: 'all', // AND search
          conditions,
          chatwork_room_id: roomId.trim(),
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
    res.json(results);
  } catch (err) {
    logger.error(`Import error: ${err.message}`);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

// CSV parser that supports multiline cells (RFC 4180 compliant)
function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentCell += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of cell
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \r\n
      }
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      }
    } else {
      currentCell += char;
    }
  }

  // Add last cell and row if exists
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

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
      // Check if it's a domain (no @ at start)
      if (value.includes('@') && !value.startsWith('@')) {
        conditions.push({
          field: 'sender',
          operator: 'contains',
          value: value,
        });
      } else if (value.includes('.')) {
        // Looks like a domain
        conditions.push({
          field: 'sender',
          operator: 'domain',
          value: value.replace(/^@/, ''),
        });
      } else {
        conditions.push({
          field: 'sender',
          operator: 'contains',
          value: value,
        });
      }
    } else if (subjectMatch) {
      conditions.push({
        field: 'subject',
        operator: 'contains',
        value: subjectMatch[1].trim(),
      });
    } else {
      // No syntax prefix, use default field
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

// GET /api/rules/bulk/export-excel - Export rules as Excel
router.get('/export-excel', async (req, res) => {
  try {
    const rules = await getAllRules();

    // Prepare data for Excel
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

      // Get account username if account_id is specified
      const accountUsername = rule.account_id ? `Account ${rule.account_id}` : '全アカウント';

      return {
        'ルール名': rule.name,
        '受信メールアドレス': accountUsername,
        '相手メールアドレス': senderValue,
        '受信件名（部分一致）': subjectValue,
        'チャットワークルームID': rule.chatwork_room_id
      };
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'ルール');

    // Generate Excel file
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

    // Decode base64
    const buffer = Buffer.from(fileData, 'base64');

    // Read Excel file
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

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
          results.errors.push(`${i + 2}行目: 転送先ルームIDが必要です`);
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

        // Create rule
        await createRule({
          name: name.trim(),
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

    logger.info(`Excel import: ${results.success} success, ${results.failed} failed`);
    res.json(results);
  } catch (err) {
    logger.error(`Excel import error: ${err.message}`);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

export default router;
