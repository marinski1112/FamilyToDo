import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const delivery=fs.readFileSync('src/notification-delivery.ts','utf8');

if(!index.includes("import { processNotifications } from './notification-delivery';")) throw new Error('index must import notification delivery orchestration');
if(index.includes('async function processNotifications(')) throw new Error('notification delivery implementation must not remain in index');
if(!index.includes('ctx.waitUntil(processNotifications(env));')) throw new Error('scheduled notification delivery wiring changed');
if(delivery.includes('cleanupNotificationLifecycle')||delivery.includes('auditNotificationLifecycle')) throw new Error('five-minute delivery path must not run lifecycle maintenance/audit');
for(const marker of [
  'export async function processNotifications(env: Env): Promise<void> {',
  "n.status IN ('pending','retry')",
  'n.sent_at IS NULL',
  'n.notify_at<=?',
  'JOIN members m ON m.id=n.member_id AND m.family_id=n.family_id',
  'm.deleted_at IS NULL',
  "n.target_type='task'",
  't.id=n.target_id AND t.family_id=n.family_id',
  "COALESCE(t.visibility_scope,'FAMILY')<>'PRIVATE' OR t.private_owner_id=n.member_id",
  'r.task_id=t.id AND r.family_id=t.family_id AND r.active=1 AND r.deleted_at IS NULL',
  "n.target_type='message'",
  'x.id=n.target_id AND x.family_id=n.family_id',
  'n.target_type IS NULL',
  "n.target_type NOT IN ('task','message')",
  'ORDER BY n.notify_at,n.id',
  'LIMIT 50',
  'web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1',
  "if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');",
  'sendWebPush(env',
  "if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');",
  'attempt_count=COALESCE(attempt_count,0)+1',
  "THEN 'error' ELSE 'retry' END",
  'logNotificationFailure(e);',
]) if(!delivery.includes(marker)) throw new Error(`notification delivery behavior marker missing: ${marker}`);
if(delivery.includes('SELECT COALESCE(attempt_count,0) attempt_count')) throw new Error('failed delivery must not add a read-before-write attempt counter query');
console.log('notification delivery modularity contract: bounded send-time guards and atomic retry update ok');
