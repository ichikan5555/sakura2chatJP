const DEFAULT_TEMPLATE = `[info][title]メール転送: {{subject}}[/title]
差出人: {{senderName}} ({{senderEmail}})
{{ccLine}}{{bccLine}}日時: {{date}}
---
{{bodyShort}}
[/info]`;

/**
 * Render a template string by replacing {{variable}} placeholders.
 * @param {string} template - Template string (empty = use default)
 * @param {object} email - Parsed email object
 * @param {object} rule - Matched rule object
 * @returns {string} Rendered message
 */
export function renderTemplate(template, message, rule) {
  const tpl = template && template.trim() ? template : DEFAULT_TEMPLATE;

  const bodyShort = (message.body || '').substring(0, 500);

  const cc = message.cc || '';
  const bcc = message.bcc || '';

  const vars = {
    sender: message.sender || '',
    senderEmail: message.senderEmail || '',
    senderName: message.senderName || '',
    username: message.accountEmail || message.senderEmail || '',
    accountEmail: message.accountEmail || '',
    cc,
    bcc,
    ccLine: cc ? `CC: ${cc}\n` : '',
    bccLine: bcc ? `BCC: ${bcc}\n` : '',
    subject: message.subject || '',
    date: message.date || '',
    body: message.body || '',
    bodyShort,
    snippet: message.snippet || '',
    ruleName: rule?.name || '',
    rule_name: rule?.name || '',
  };

  // Support both {var} and {{var}} syntax
  return tpl.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, doubleKey, singleKey) => {
    const key = doubleKey || singleKey;
    return key in vars ? vars[key] : match;
  });
}
