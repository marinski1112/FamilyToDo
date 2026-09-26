import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const schedule=fs.readFileSync('src/scheduled-dispatch.ts','utf8');
const delivery=fs.readFileSync('src/notification-delivery.ts','utf8');
const lifecycle=fs.readFileSync('src/notification-lifecycle.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const migration=fs.readFileSync('migrations/0064_d1_scheduled_hotpath_indexes.sql','utf8');

if(delivery.includes('cleanupNotificationLifecycle')||delivery.includes('auditNotificationLifecycle')) throw new Error('five-minute notification delivery must not run full lifecycle maintenance');
if(index.includes('async function cleanupNotificationLifecycle(')||delivery.includes('async function cleanupNotificationLifecycle(')) throw new Error('notification lifecycle cleanup must remain isolated from index and delivery modules');
if(!index.includes("import { cleanupNotificationLifecycle, auditNotificationLifecycle } from './notification-lifecycle';")) throw new Error('index must import low-frequency lifecycle jobs');
if(!index.includes('if(plan.hourlyCleanup)')||!index.includes(`run('notification_lifecycle',cleanupNotificationLifecycle);`)) throw new Error('hourly lifecycle repair dispatch wiring missing');
if(!index.includes('if(plan.dailyNotificationAudit)')||!index.includes(`run('notification_audit',auditNotificationLifecycle);`)) throw new Error('daily lifecycle audit dispatch wiring missing');
if(!schedule.includes('hourlyCleanup: minute === 17')||!schedule.includes('dailyNotificationAudit: hour === 18 && minute === 29')) throw new Error('low-frequency lifecycle schedule mapping missing');
if(!wrangler.includes('"* * * * *"')) throw new Error('wrangler consolidated scheduler configuration missing');
if(!lifecycle.includes('export async function cleanupNotificationLifecycle(env: Env): Promise<void> {')) throw new Error('notification lifecycle module must export cleanupNotificationLifecycle');
if(!lifecycle.includes('export async function auditNotificationLifecycle(env: Env): Promise<void> {')) throw new Error('notification lifecycle module must export auditNotificationLifecycle');
const cleanupStart=lifecycle.indexOf('export async function cleanupNotificationLifecycle');
const auditStart=lifecycle.indexOf('export async function auditNotificationLifecycle');
const cleanupBody=lifecycle.slice(cleanupStart,auditStart);
const auditBody=lifecycle.slice(auditStart);
if(cleanupBody.includes('COUNT(*)')||cleanupBody.includes('DELETE FROM activity_logs')) throw new Error('hourly lifecycle repair must not contain full-table audit/retention scans');
for(const sentinel of [
  "UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry')",
  'UPDATE web_push_subscriptions SET enabled=0',
]){
  if(!cleanupBody.includes(sentinel)) throw new Error(`notification lifecycle repair sentinel missing: ${sentinel}`);
}
for(const sentinel of [
  "DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')",
  'deleted_completion_history',
  'family_log_link_issues',
  'task_family_log_template_issues',
  "console.warn('[Family TODO LINE] lifecycle audit',audit)",
]){
  if(!auditBody.includes(sentinel)) throw new Error(`notification lifecycle audit sentinel missing: ${sentinel}`);
}
for(const marker of [
  'CREATE INDEX IF NOT EXISTS idx_notifications_delivery_due',
  "WHERE sent_at IS NULL AND status IN ('pending','retry')",
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_retention',
  'ON activity_logs(occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_recurrence_rules_task_lifecycle',
  'ON recurrence_rules(task_id,family_id,active,deleted_at)',
]) if(!migration.includes(marker)) throw new Error(`D1 scheduled hot-path index missing: ${marker}`);
console.log('notification lifecycle modularity contract: low-frequency repair/audit and D1 hot-path indexes ok');
