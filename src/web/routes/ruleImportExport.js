import { Router } from 'express';
import { getAllRules, createRule } from '../../db/database.js';
import { requireAuth } from '../middleware/session.js';
import { logger } from '../../logger.js';

const router = Router();
router.use(requireAuth);

// GET /api/rules/export - Export rules as CSV
router.get('/export', (req, res) => {
  try {
    const rules = getAllRules();

    // CSV header
    const header = 'ルール名,送信者メアド,件名キーワード,転送先ルームID\n';

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

// POST /api/rules/import - Import rules from CSV
router.post('/import', (req, res) => {
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

        // Support both 4-column and 5-column formats
        // 4-column: ルール名,送信者,件名,ルームID
        // 5-column: ルール名,送信者,件名,メッセージテンプレート,ルームID
        if (row.length < 4) {
          results.failed++;
          results.errors.push(`${i + 2}行目: 列が不足しています (${row.length}列)`);
          continue;
        }

        const hasTemplate = row.length >= 5;
        const name = row[0];
        const senderField = row[1];
        const subjectField = row[2];
        const messageTemplate = hasTemplate ? row[3] : '';
        const roomId = hasTemplate ? row[4] : row[3];

        if (!name || !name.trim()) {
          results.failed++;
          results.errors.push(`${i + 2}行目: ルール名が必要です`);
          continue;
        }

        if (!roomId || !roomId.trim()) {
          results.failed++;
          results.errors.push(`${i + 2}行目: 転送先ルームIDが必要です`);
          continue;
        }

        // Parse search syntax and build conditions
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
        createRule({
          name: name.trim(),
          enabled: 1,
          source: 'imap',
          match_type: 'any', // Use 'any' for multiple conditions
          conditions,
          chatwork_room_id: roomId.trim(),
          message_template: messageTemplate.trim(),
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

export default router;
