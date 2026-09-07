import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const delivery=read('src/notification-delivery.ts');
const lifecycle=read('src/notification-lifecycle.ts');
const index=read('src/index.ts');
const wrangler=read('wrangler.jsonc');
const migration=read('migrations/0064_d1_scheduled_hotpath_indexes.sql');

test('five-minute notification path is bounded and does not run lifecycle maintenance',()=>{
  assert.equal(delivery.includes('cleanupNotificationLifecycle'),false);
  assert.equal(delivery.includes('auditNotificationLifecycle'),false);
  assert.match(delivery,/JOIN members m ON m\.id=n\.member_id AND m\.family_id=n\.family_id/);
  assert.match(delivery,/n\.notify_at<=\?/);
  assert.match(delivery,/ORDER BY n\.notify_at,n\.id\s+LIMIT 50/);
  assert.match(delivery,/m\.deleted_at IS NULL/);
  assert.match(delivery,/t\.private_owner_id=n\.member_id/);
  assert.match(delivery,/r\.active=1 AND r\.deleted_at IS NULL/);
  assert.match(delivery,/SELECT 1 FROM messages x WHERE x\.id=n\.target_id AND x\.family_id=n\.family_id/);
  assert.match(delivery,/n\.target_type IS NULL/);
  assert.match(delivery,/web_push_subscriptions WHERE member_id=\? AND family_id=\? AND enabled=1/);
  assert.equal(delivery.includes('SELECT COALESCE(attempt_count,0) attempt_count'),false);
  assert.match(delivery,/attempt_count=COALESCE\(attempt_count,0\)\+1/);

  const fiveStart=index.indexOf("if(controller.cron==='*/5 * * * *')");
  const hourlyStart=index.indexOf("if(controller.cron==='17 * * * *')");
  assert.ok(fiveStart>=0&&hourlyStart>fiveStart);
  const fiveBody=index.slice(fiveStart,hourlyStart);
  assert.equal(fiveBody.includes('cleanupNotificationLifecycle'),false);
  assert.equal(fiveBody.includes('auditNotificationLifecycle'),false);
  assert.match(fiveBody,/processNotifications\(env\)/);
});

test('cleanup and full integrity audit run at low frequency',()=>{
  const cleanupStart=lifecycle.indexOf('export async function cleanupNotificationLifecycle');
  const auditStart=lifecycle.indexOf('export async function auditNotificationLifecycle');
  assert.ok(cleanupStart>=0&&auditStart>cleanupStart);
  const cleanupBody=lifecycle.slice(cleanupStart,auditStart);
  const auditBody=lifecycle.slice(auditStart);
  assert.equal(cleanupBody.includes('COUNT(*)'),false);
  assert.equal(cleanupBody.includes('activity_logs'),false);
  assert.ok((auditBody.match(/COUNT\(\*\)/g)||[]).length>=12);
  assert.match(auditBody,/activity_logs/);
  assert.match(auditBody,/-31 days/);
  assert.equal(/DELETE FROM (task_completion_history|item_completion_history|shopping_completion_history|family_logs|deleted_completion_history)/.test(auditBody),false);

  assert.match(wrangler,/"17 \* \* \* \*"/);
  assert.match(wrangler,/"29 18 \* \* \*"/);
  assert.match(index,/controller\.cron==='17 \* \* \* \*'[\s\S]*cleanupNotificationLifecycle\(env\)/);
  assert.match(index,/controller\.cron==='29 18 \* \* \*'[\s\S]*auditNotificationLifecycle\(env\)/);
});

test('scheduled hot queries have additive indexes',()=>{
  for(const marker of [
    'CREATE INDEX IF NOT EXISTS idx_notifications_delivery_due',
    "WHERE sent_at IS NULL AND status IN ('pending','retry')",
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_retention',
    'ON activity_logs(occurred_at)',
    'CREATE INDEX IF NOT EXISTS idx_recurrence_rules_task_lifecycle',
    'ON recurrence_rules(task_id,family_id,active,deleted_at)',
  ])assert.ok(migration.includes(marker),`missing D1 hot-path index marker: ${marker}`);
  assert.equal(/DROP\s+(?:INDEX|TABLE)/i.test(migration),false);
});
