import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/notification-delivery.ts';
const contractPath='scripts/notification-delivery-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

const replaceOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0) throw new Error(`duplicate ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};

let index=fs.readFileSync(indexPath,'utf8');
const start=index.indexOf('async function processNotifications(env: Env): Promise<void> {');
if(start<0) throw new Error('processNotifications definition missing');
const block=index.slice(start).trim();
if((block.match(/async function processNotifications/g)||[]).length!==1) throw new Error('unexpected processNotifications multiplicity');
index=index.slice(0,start).trimEnd()+'\n';

const nowJstLine="const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');\n\n";
index=replaceOnce(index,nowJstLine,'','nowJst helper');
index=replaceOnce(index,"import { sendWebPush, webPushConfigured } from './webpush';\n",'', 'webpush import');
index=replaceOnce(index,"import { logNotificationFailure, logRequestFailure } from './observability/errors';","import { logRequestFailure } from './observability/errors';",'observability imports');
index=replaceOnce(index,"import { cleanupNotificationLifecycle } from './notification-lifecycle';","import { processNotifications } from './notification-delivery';",'notification delivery import');
fs.writeFileSync(indexPath,index);

const moduleSource=`import { sendWebPush, webPushConfigured } from './webpush';\nimport { logNotificationFailure } from './observability/errors';\nimport { cleanupNotificationLifecycle } from './notification-lifecycle';\n\n${nowJstLine}${block.replace('async function processNotifications','export async function processNotifications')}\n`;
fs.writeFileSync(modulePath,moduleSource);

const contract=`import fs from 'node:fs';\n\nconst index=fs.readFileSync('src/index.ts','utf8');\nconst delivery=fs.readFileSync('src/notification-delivery.ts','utf8');\n\nif(!index.includes("import { processNotifications } from './notification-delivery';")) throw new Error('index must import notification delivery orchestration');\nif(index.includes('async function processNotifications(')) throw new Error('notification delivery implementation must not remain in index');\nif(!index.includes('ctx.waitUntil(processNotifications(env));')) throw new Error('scheduled notification delivery wiring changed');\nfor(const marker of [\n  'export async function processNotifications(env: Env): Promise<void> {',\n  'await cleanupNotificationLifecycle(env);',\n  "n.status IN ('pending','retry')",\n  'LIMIT 50',\n  "const channel='WEB_PUSH'",\n  "if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');",\n  'sendWebPush(env',\n  "if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');",\n  "const status=attempts>=5?'error':'retry';",\n  'logNotificationFailure(e);',\n]) if(!delivery.includes(marker)) throw new Error(\`notification delivery behavior marker missing: \${marker}\`);\nif(delivery.indexOf('await cleanupNotificationLifecycle(env);')>delivery.indexOf('const due = await env.DB.prepare')) throw new Error('lifecycle cleanup must run before loading due notifications');\nconsole.log('notification delivery modularity contract ok');\n`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
manifest=replaceOnce(manifest,"      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],","      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],\n      ['notification-delivery-modularity','node scripts/notification-delivery-modularity-contract.mjs'],",'regression manifest anchor');
fs.writeFileSync(manifestPath,manifest);

console.log('notification delivery extraction applied');
