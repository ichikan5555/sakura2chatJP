import { getImapClientForAccount } from '../src/imap/auth.js';
import { getEnabledAccounts, updatePollerState } from '../src/db/database.js';
import { logger } from '../src/logger.js';

async function resetToLatest() {
  console.log('=== 過去メールをスキップして最新状態に設定 ===\n');

  const accounts = await getEnabledAccounts();

  for (const account of accounts) {
    try {
      console.log(`処理中: ${account.name} (${account.username})`);

      const client = await getImapClientForAccount(account);
      const lock = await client.getMailboxLock('INBOX');

      try {
        // NOOPでステータスを更新
        await client.noop();

        const status = client.mailbox;
        console.log(`  メールボックス情報:`, {
          uidNext: status?.uidNext,
          uidValidity: status?.uidValidity,
          exists: status?.exists,
          path: status?.path
        });

        // uidNextが取得できない場合、最後のメールのUIDを取得
        let currentUidNext = status?.uidNext;

        if (!currentUidNext && status?.exists > 0) {
          console.log(`  uidNextが未定義のため、最後のメールから取得中...`);
          // 最後のメールのUIDを取得
          const lastMessages = [];
          for await (const msg of client.fetch('*', { uid: true })) {
            lastMessages.push(msg);
            if (lastMessages.length >= 1) break; // 最後の1通だけ
          }
          if (lastMessages.length > 0) {
            currentUidNext = lastMessages[0].uid + 1;
            console.log(`  最後のメールUID: ${lastMessages[0].uid}, 次のUID: ${currentUidNext}`);
          }
        }

        if (currentUidNext && currentUidNext > 1) {
          const lastUid = currentUidNext - 1;
          await updatePollerState(account.id, {
            last_uid: lastUid,
            last_poll_at: new Date().toISOString()
          });

          console.log(`✅ ${account.name}: last_uid を ${lastUid} に設定（過去メールはスキップされます）`);
        } else {
          console.log(`⚠️ ${account.name}: メールボックスが空、またはuidNext=${currentUidNext}`);
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      console.error(`❌ ${account.name}: エラー - ${err.message}`);
    }
  }

  console.log('\n完了しました。');
  process.exit(0);
}

resetToLatest().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
