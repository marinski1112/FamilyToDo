import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const delivery=fs.readFileSync('src/notification-delivery.ts','utf8');
const leaseMigration=fs.readFileSync('migrations/0091_notification_delivery_lease.sql','utf8');

if(!index.includes("import { processNotifications } from './notification-delivery';")) throw new Error('index must import notification delivery orchestration');
if(index.includes('async function processNotifications(')) throw new Error('notification delivery implementation must not remain in index');
if(!index.includes(`run('notifications',processNotifications);`)) throw new Error('scheduled notification delivery wiring changed');
if(delivery.includes('cleanupNotificationLifecycle')||delivery.includes('auditNotificationLifecycle')) throw new Error('five-minute delivery path must not run lifecycle maintenance/audit');
for(const marker of [
  'export async function processNotifications(env: Env): Promise<void> {',
  "n.status IN ('pending','retry')",
  'n.sent_at IS NULL',
  'n.notify_at<=?',
  'n.delivery_lease_token IS NULL',
  'n.delivery_lease_expires_at IS NULL',
  'n.delivery_lease_expires_at<=?',
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
  'const NOTIFICATION_DELIVERY_LEASE_MS = 15 * 60 * 1000;',
  'const leaseToken=crypto.randomUUID();',
  'SET delivery_lease_token=?,delivery_lease_expires_at=?,updated_at=?',
  'if(Number(claim.meta.changes || 0)!==1)continue;',
  'web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1',
  "if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');",
  'sendWebPush(env',
  "if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');",
  'delivery_lease_token=NULL,delivery_lease_expires_at=NULL',
  'attempt_count=COALESCE(attempt_count,0)+1',
  "THEN 'error' ELSE 'retry' END",
  'logNotificationFailure(e);',
  'async function finalizeAcceptedNotification(env: Env, notificationId: number, leaseToken: string): Promise<boolean> {',
  'if(Number(sentResult.meta.changes || 0)===1)return true;',
  "SELECT status,sent_at,delivery_lease_token FROM notifications WHERE id=?",
  "SET status='error',last_error=?,delivery_lease_token=NULL,delivery_lease_expires_at=NULL,updated_at=?",
  'Web Push accepted; sent finalization could not be confirmed.',
  'await finalizeAcceptedNotification(env,Number(n.id),leaseToken);',
  'await recordSubscriptionState(',
  'const subscriptionCache=new Map<string,PushSubscriptionRow[]>();',
  'let subs=subscriptionCache.get(subscriptionKey);',
  'if(subs===undefined){',
  'subscriptionCache.set(subscriptionKey,subs);',
  'for(const sub of [...subs]){',
  'if(cached&&index>=0)cached.splice(index,1);',
]) if(!delivery.includes(marker)) throw new Error(`notification delivery behavior marker missing: ${marker}`);

for(const marker of [
  'ALTER TABLE notifications ADD COLUMN delivery_lease_token TEXT NULL;',
  'ALTER TABLE notifications ADD COLUMN delivery_lease_expires_at TEXT NULL;',
]) if(!leaseMigration.includes(marker)) throw new Error(`notification delivery lease migration marker missing: ${marker}`);
if(leaseMigration.includes('CREATE INDEX')) throw new Error('notification delivery lease migration must reuse the existing bounded due-work index');

const claimPos=delivery.indexOf('const claim=await env.DB.prepare(`UPDATE notifications');
const sendPos=delivery.indexOf('sendWebPush(env');
if(claimPos<0||sendPos<0||claimPos>sendPos) throw new Error('notification delivery must acquire its atomic lease before provider send');
const fencedUpdates=delivery.match(/WHERE id=\? AND delivery_lease_token=\?/g)||[];
if(fencedUpdates.length<3) throw new Error('notification success, quarantine and failure updates must all be fenced by lease token');
const finalizerCallPos=delivery.indexOf('await finalizeAcceptedNotification(env,Number(n.id),leaseToken);');
if(finalizerCallPos<sendPos) throw new Error('accepted delivery finalization must happen after provider send');
if(!delivery.includes("recordSubscriptionState(env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?")) throw new Error('subscription success bookkeeping must be best-effort after provider acceptance');
if(delivery.includes('SELECT COALESCE(attempt_count,0) attempt_count')) throw new Error('failed delivery must not add a read-before-write attempt counter query');
if((delivery.match(/SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions/g)||[]).length!==1) throw new Error('notification delivery must retain one subscription query site behind the per-run member cache');
const cacheGetPos=delivery.indexOf('let subs=subscriptionCache.get(subscriptionKey);');
const subscriptionReadPos=delivery.indexOf('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions');
const cacheSetPos=delivery.indexOf('subscriptionCache.set(subscriptionKey,subs);');
if(cacheGetPos<0||subscriptionReadPos<cacheGetPos||cacheSetPos<subscriptionReadPos) throw new Error('subscription D1 read must be guarded by the per-run family/member cache');
console.log('notification delivery modularity contract: bounded due query, atomic lease claim, per-run tenant subscription read cache, best-effort subscription bookkeeping, verified sent finalization and fenced retry updates ok');
