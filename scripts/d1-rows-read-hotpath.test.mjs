import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const delivery=read('src/notification-delivery.ts');
const lifecycle=read('src/notification-lifecycle.ts');
const index=read('src/index.ts');
const schedule=read('src/scheduled-dispatch.ts');
const recurrence=read('src/recurrence-projection.ts');
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
  assert.match(delivery,/const subscriptionCache=new Map<string,PushSubscriptionRow\[]>\(\)/);
  assert.match(delivery,/let subs=subscriptionCache\.get\(subscriptionKey\)/);
  assert.match(delivery,/if\(subs===undefined\)\{/);
  assert.match(delivery,/subscriptionCache\.set\(subscriptionKey,subs\)/);
  assert.match(delivery,/if\(cached&&index>=0\)cached\.splice\(index,1\)/);
  assert.equal((delivery.match(/SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions/g)||[]).length,1);
  assert.equal(delivery.includes('SELECT COALESCE(attempt_count,0) attempt_count'),false);
  assert.match(delivery,/attempt_count=COALESCE\(attempt_count,0\)\+1/);

  const fiveStart=index.indexOf('if(plan.fiveMinuteCore)');
  const hourlyStart=index.indexOf('if(plan.hourlyCleanup)');
  assert.ok(fiveStart>=0&&hourlyStart>fiveStart);
  const fiveBody=index.slice(fiveStart,hourlyStart);
  assert.equal(fiveBody.includes('cleanupNotificationLifecycle'),false);
  assert.equal(fiveBody.includes('auditNotificationLifecycle'),false);
  assert.match(fiveBody,/processNotifications\(env\)/);
  assert.match(schedule,/fiveMinuteCore: minute % 5 === 0/);
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

  assert.match(wrangler,/"\* \* \* \* \*"/);
  assert.match(schedule,/hourlyCleanup: minute === 17/);
  assert.match(schedule,/dailyNotificationAudit: hour === 18 && minute === 29/);
  assert.match(index,/if\(plan\.hourlyCleanup\)[\s\S]*cleanupNotificationLifecycle\(env\)/);
  assert.match(index,/if\(plan\.dailyNotificationAudit\)[\s\S]*auditNotificationLifecycle\(env\)/);
});

test('recurrence completion read is bounded to projected rules and dates',()=>{
  const segment=recurrence.slice(recurrence.indexOf('export async function recurringForFamilyRange'),recurrence.indexOf('export async function recurringForDate'));
  assert.ok(segment.includes("r.family_id=? AND ${taskVisibilitySql('t')} AND r.active=1"));
  assert.ok(segment.includes('o.recurrence_rule_id IN (${projectedRulePlaceholders})'));
  assert.ok(segment.includes('o.occurrence_date BETWEEN ? AND ? GROUP BY c.occurrence_id'));
  assert.equal((segment.match(/FROM recurrence_occurrence_completions c/g)||[]).length,1);
  assert.equal((segment.match(/db\.prepare\(/g)||[]).length,4,'three bounded reads plus batched missing inserts');
  assert.equal(segment.includes('task_assignees'),false);
  assert.ok(segment.includes('Scheduled family summaries use memberId=0 for FAMILY-only visibility.')===false);
  assert.ok(recurrence.includes('Scheduled family summaries use memberId=0 for FAMILY-only visibility.'));
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
