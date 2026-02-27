import { getEnabledAccounts, getEnabledRules } from '../src/db/database.js';

async function check() {
  console.log('=== 設定確認 ===\n');

  const accounts = await getEnabledAccounts();
  console.log(`✅ 有効なアカウント: ${accounts.length}件`);
  accounts.forEach(acc => {
    console.log(`  - ${acc.name} (${acc.username}) - enabled: ${acc.enabled}`);
  });

  console.log('');

  const rules = await getEnabledRules('imap');
  console.log(`✅ 有効なルール: ${rules.length}件`);
  rules.forEach(rule => {
    console.log(`  - ${rule.name} → Room: ${rule.chatwork_room_id} - enabled: ${rule.enabled}`);
  });

  process.exit(0);
}

check().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
