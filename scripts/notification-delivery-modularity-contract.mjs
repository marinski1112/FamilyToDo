import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const delivery=fs.readFileSync('src/notification-delivery.ts','utf8');

if(!index.includes("import { processNotifications } from './notification-delivery';")) throw new Error('index must import notification delivery orchestration');
if(index.includes('async function processNotifications(')) throw new Error('notification delivery implementation must not remain in index');
if(!index.includes('ctx.waitUntil(processNotifications(env));')) throw new Error('scheduled notification delivery wiring changed');
for(const marker of [
  'export async function processNotifications(env: Env): Promise<void> {',
  'await cleanupNotificationLifecycle(env);',
  "n.status IN ('pending','retry')",
  'LIMIT 50',
  "const channel='WEB_PUSH'",
  "if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');",
  'sendWebPush(env',
  "if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');",
  "const status=attempts>=5?'error':'retry';",
  'logNotificationFailure(e);',
]) if(!delivery.includes(marker)) throw new Error(`notification delivery behavior marker missing: ${marker}`);
if(delivery.indexOf('await cleanupNotificationLifecycle(env);')>delivery.indexOf('const due = await env.DB.prepare')) throw new Error('lifecycle cleanup must run before loading due notifications');
console.log('notification delivery modularity contract ok');
