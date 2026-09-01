import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const delivery=fs.readFileSync('src/notification-delivery.ts','utf8');
const lifecycle=fs.readFileSync('src/notification-lifecycle.ts','utf8');

if(!delivery.includes("import { cleanupNotificationLifecycle } from './notification-lifecycle';")) throw new Error('notification delivery must import notification lifecycle cleanup');
if(index.includes('async function cleanupNotificationLifecycle(')||delivery.includes('async function cleanupNotificationLifecycle(')) throw new Error('notification lifecycle cleanup must remain isolated from index and delivery modules');
if(!delivery.includes('export async function processNotifications(env: Env): Promise<void> {\n  await cleanupNotificationLifecycle(env);')) throw new Error('notification delivery must run lifecycle cleanup before loading due notifications');
if(!lifecycle.includes('export async function cleanupNotificationLifecycle(env: Env): Promise<void> {')) throw new Error('notification lifecycle module must export cleanupNotificationLifecycle');
for(const sentinel of [
  "DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')",
  "UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry')",
  'UPDATE web_push_subscriptions SET enabled=0',
  'deleted_completion_history',
  'family_log_link_issues',
  'task_family_log_template_issues',
  "console.warn('[Family TODO LINE] lifecycle audit',audit)",
]){
  if(!lifecycle.includes(sentinel)) throw new Error(`notification lifecycle behavior sentinel missing: ${sentinel}`);
}
console.log('notification lifecycle modularity contract: ok');
