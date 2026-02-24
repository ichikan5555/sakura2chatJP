/**
 * Match an email against a list of rules.
 * @param {Array} rules - sorted by priority
 * @param {object} email - { senderEmail, subject, body, ... }
 * @returns {Array} matched rules
 */
export function matchRules(rules, email) {
  return rules.filter(rule => evaluateRule(rule, email));
}

function evaluateRule(rule, email) {
  let conditions;
  try {
    conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
  } catch { conditions = []; }

  if (!Array.isArray(conditions) || conditions.length === 0) return true; // no conditions = match all

  const results = conditions.map(c => evaluateCondition(c, email));

  return rule.match_type === 'any'
    ? results.some(r => r)
    : results.every(r => r);
}

/**
 * Evaluate a single condition.
 * condition: { field: "sender"|"subject"|"body", operator: string, value: string }
 */
function evaluateCondition(cond, email) {
  const { field, operator, value } = cond;
  if (!value && operator !== 'exists') return true; // empty value = skip

  const target = getFieldValue(field, email);

  switch (operator) {
    case 'contains':
      return target.toLowerCase().includes(value.toLowerCase());

    case 'not_contains':
      return !target.toLowerCase().includes(value.toLowerCase());

    case 'equals':
      return target.toLowerCase() === value.toLowerCase();

    case 'starts_with':
      return target.toLowerCase().startsWith(value.toLowerCase());

    case 'ends_with':
      return target.toLowerCase().endsWith(value.toLowerCase());

    case 'domain':
      // sender email domain match: value = "example.com"
      return target.toLowerCase().endsWith('@' + value.toLowerCase());

    case 'matches':
      try {
        return new RegExp(value, 'i').test(target);
      } catch { return false; }

    default:
      return false;
  }
}

function getFieldValue(field, email) {
  switch (field) {
    case 'sender': return email.senderEmail || '';
    case 'subject': return email.subject || '';
    case 'body': return email.body || '';
    default: return '';
  }
}
