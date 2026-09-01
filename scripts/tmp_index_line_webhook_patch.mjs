import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/line-webhook.ts';
const contractPath='scripts/line-webhook-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';
const privacyPath='scripts/worker-error-log-privacy-contract.mjs';
const authPath='scripts/platform-auth-contract.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const verifyFn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='verifyLineWebhook');
const webhookFn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='webhook');
if(!verifyFn||!webhookFn) throw new Error('LINE webhook function declarations not found in current index.ts');
if(verifyFn.getStart(sourceFile)>=webhookFn.getStart(sourceFile)) throw new Error('unexpected LINE webhook declaration order');
const verifyText=index.slice(verifyFn.getStart(sourceFile),verifyFn.end);
const webhookText=index.slice(webhookFn.getStart(sourceFile),webhookFn.end);
for(const sentinel of [
  "crypto.subtle.importKey('raw'",
  "{name:'HMAC',hash:'SHA-256'}",
  "request.headers.get('x-line-signature')",
  "LINE_${String(event.type||'UNKNOWN').toUpperCase()}",
  "const { replyLineMessage } = await import('./line')",
  "logLineWebhookFailure('reply',e)",
  "logLineWebhookFailure('handle',e)",
]) if(!(verifyText+webhookText).includes(sentinel)) throw new Error(`LINE webhook source sentinel missing: ${sentinel}`);

const nowJst="const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');";
const exportedWebhook=webhookText.replace(/^async function webhook\(/,'export async function webhook(');
if(exportedWebhook===webhookText) throw new Error('webhook export rewrite failed');
fs.writeFileSync(modulePath,[
  "import { logLineWebhookFailure } from './observability/errors';",
  '',
  nowJst,
  '',
  verifyText,
  '',
  exportedWebhook,
  '',
].join('\n'));

const removeStart=verifyFn.getStart(sourceFile);
const removeEnd=webhookFn.end;
index=index.slice(0,removeStart)+index.slice(removeEnd);
const digestImport="import { processLineDailyDigests } from './line-daily-digest';\n";
if(!index.includes(digestImport)) throw new Error('line daily digest import anchor missing');
index=index.replace(digestImport,digestImport+"import { webhook } from './line-webhook';\n");
const oldObs="import { logLineWebhookFailure, logNotificationFailure, logRequestFailure, logTaskCreationCleanupFailure } from './observability/errors';";
const newObs="import { logNotificationFailure, logRequestFailure, logTaskCreationCleanupFailure } from './observability/errors';";
if(!index.includes(oldObs)) throw new Error('observability import anchor changed');
index=index.replace(oldObs,newObs);
if(index.includes('async function verifyLineWebhook(')||index.includes('async function webhook(')) throw new Error('LINE webhook implementation remained in index.ts');
if(index.includes('logLineWebhookFailure(')) throw new Error('LINE webhook logger call remained in index.ts');
if(!index.includes("if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);")) throw new Error('LINE webhook route wiring changed');
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const webhook=fs.readFileSync('src/line-webhook.ts','utf8');

if(!index.includes("import { webhook } from './line-webhook';")) throw new Error('index.ts must import LINE webhook module');
if(index.includes('async function verifyLineWebhook(')||index.includes('async function webhook(')) throw new Error('LINE webhook implementation must not remain in index.ts');
if(!index.includes("if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);")) throw new Error('LINE webhook route wiring changed');
if(!webhook.includes('export async function webhook(request: Request, env: Env): Promise<Response> {')) throw new Error('LINE webhook module must export webhook handler');
if(!webhook.includes('async function verifyLineWebhook(body: string, signature: string, secret: string): Promise<boolean> {')) throw new Error('LINE signature verifier must remain private to webhook module');
for(const sentinel of [
  "crypto.subtle.importKey('raw'",
  "{name:'HMAC',hash:'SHA-256'}",
  "request.headers.get('x-line-signature') || ''",
  "if(!(await verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET))) return new Response('OK',{status:200});",
  "SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1",
  "JSON.stringify({event_type:event.type,message_type:event.message?.type||null})",
  "const { replyLineMessage } = await import('./line')",
  "logLineWebhookFailure('reply',e)",
  "logLineWebhookFailure('handle',e)",
  "return new Response('OK',{status:200});",
]){
  if(!webhook.includes(sentinel)) throw new Error(\`LINE webhook behavior sentinel missing: \${sentinel}\`);
}
if(webhook.includes('console.error')||webhook.includes('console.log')) throw new Error('LINE webhook must not directly log request/event/exception detail');
console.log('LINE webhook modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const manifestAnchor="      ['line-daily-digest-modularity','node scripts/line-daily-digest-modularity-contract.mjs'],\n";
if(!manifest.includes(manifestAnchor)) throw new Error('regression manifest LINE daily digest anchor missing');
manifest=manifest.replace(manifestAnchor,manifestAnchor+"      ['line-webhook-modularity','node scripts/line-webhook-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

let privacy=fs.readFileSync(privacyPath,'utf8');
const obsAnchor="const observability=fs.readFileSync(new URL('../src/observability/errors.ts',import.meta.url),'utf8');\n";
if(!privacy.includes(obsAnchor)) throw new Error('worker privacy observability anchor missing');
privacy=privacy.replace(obsAnchor,obsAnchor+"const lineWebhook=fs.readFileSync(new URL('../src/line-webhook.ts',import.meta.url),'utf8');\nconst workerOperational=index+lineWebhook;\n");
const directIndex="if(index.includes('console.error'))throw new Error('src/index.ts must not directly forward operational exceptions to console.error');";
if(!privacy.includes(directIndex)) throw new Error('worker privacy direct console assertion anchor missing');
privacy=privacy.replace(directIndex,"if(workerOperational.includes('console.error'))throw new Error('Worker operational modules must not directly forward exceptions to console.error');");
if(!privacy.includes('if(index.includes(forbidden))')) throw new Error('worker privacy forbidden source anchor missing');
privacy=privacy.replace('if(index.includes(forbidden))','if(workerOperational.includes(forbidden))');
if(!privacy.includes('const count=index.split(required).length-1;')) throw new Error('worker privacy required wrapper count anchor missing');
privacy=privacy.replace('const count=index.split(required).length-1;','const count=workerOperational.split(required).length-1;');
fs.writeFileSync(privacyPath,privacy);

let auth=fs.readFileSync(authPath,'utf8');
const authIndexAnchor="const index=read('src/index.ts');\n";
if(!auth.includes(authIndexAnchor)) throw new Error('platform auth index anchor missing');
auth=auth.replace(authIndexAnchor,authIndexAnchor+"const lineWebhook=read('src/line-webhook.ts');\n");
const oldAuthAssertion="assert.ok(index.includes(\"verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET)\"),'LINE webhook must continue using the Messaging API channel secret');";
const newAuthAssertion="assert.ok(lineWebhook.includes(\"verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET)\"),'LINE webhook must continue using the Messaging API channel secret');";
if(!auth.includes(oldAuthAssertion)) throw new Error('platform auth LINE webhook assertion anchor missing');
auth=auth.replace(oldAuthAssertion,newAuthAssertion);
fs.writeFileSync(authPath,auth);

console.log('LINE webhook extraction patch applied');
