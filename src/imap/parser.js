import { simpleParser } from 'mailparser';
import { logger } from '../logger.js';

/**
 * Parse an IMAP message into a structured object.
 * @param {object} envelope - IMAP envelope
 * @param {Buffer|string} source - Raw email source
 * @returns {Promise<{ messageId: string, sender: string, senderEmail: string, senderName: string, cc: string, bcc: string, subject: string, date: string, body: string, snippet: string }>}
 */
export async function parseMessage(envelope, source) {
  try {
    const parsed = await simpleParser(source);

    const from = parsed.from?.value?.[0] || {};
    const senderName = from.name || from.address || '';
    const senderEmail = from.address || '';
    const sender = from.name ? `${from.name} <${from.address}>` : from.address || '';

    const cc = parsed.cc?.text || '';
    const bcc = parsed.bcc?.text || '';
    const subject = parsed.subject || '(件名なし)';
    const date = parsed.date ? parsed.date.toISOString() : '';

    // 本文: text優先、なければHTMLをテキスト化
    let body = parsed.text || '';
    if (!body && parsed.html) {
      body = stripHtml(parsed.html);
    }

    const snippet = body.substring(0, 100);

    return {
      messageId: envelope.uid || String(envelope.seq),
      sender,
      senderEmail,
      senderName,
      cc,
      bcc,
      subject,
      date,
      body,
      snippet,
    };
  } catch (err) {
    logger.error('Failed to parse message', err);
    return {
      messageId: String(envelope.uid || envelope.seq),
      sender: '',
      senderEmail: '',
      senderName: '',
      cc: '',
      bcc: '',
      subject: '(パース失敗)',
      date: '',
      body: '',
      snippet: '',
    };
  }
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
