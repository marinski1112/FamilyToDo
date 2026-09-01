import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/task-api.ts';
const contractPath='scripts/task-api-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const taskFn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='taskApi');
const visibleFn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='calendarVisibleFlag');
if(!taskFn||!visibleFn) throw new Error('taskApi/calendarVisibleFlag declaration not found in current index.ts');
const visibleUses=(index.match(/\bcalendarVisibleFlag\b/g)||[]).length;
if(visibleUses!==2) throw new Error(`calendarVisibleFlag has unexpected use count: ${visibleUses}`);
const taskText=index.slice(taskFn.getStart(sourceFile),taskFn.end);
const visibleText=index.slice(visibleFn.getStart(sourceFile),visibleFn.end);
for(const sentinel of [
  "if(request.method==='DELETE')",
  "taskVisibilitySql('t')",
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'archiveTaskCompletionStatements',
  'queueCalendarProjectionAfterMutation',
  'buildStoredTaskRange',
  'calendarVisibleFlag(b)',
  "visibility_scope,private_owner_id",
  'logTaskCreationCleanupFailure',
  "return json({ok:true,id},201)",
]) if(!taskText.includes(sentinel)) throw new Error(`taskApi source sentinel missing: ${sentinel}`);

const exported=taskText.replace(/^async function taskApi\(/,'export async function taskApi(');
if(exported===taskText) throw new Error('taskApi export rewrite failed');
const nowJst="const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');";
fs.writeFileSync(modulePath,[
  "import { json } from './response';",
  "import { taskVisibilitySql } from './app';",
  "import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements } from './lifecycle';",
  "import { queueCalendarProjectionAfterMutation, wakeCalendarOutbox } from './google-calendar';",
  "import { buildStoredTaskRange } from './task-range-safety';",
  "import { logTaskCreationCleanupFailure } from './observability/errors';",
  '',
  nowJst,
  visibleText,
  '',
  exported,
  '',
].join('\n'));

const ranges=[
  [taskFn.getStart(sourceFile),taskFn.end],
  [visibleFn.getStart(sourceFile),visibleFn.end],
].sort((a,b)=>b[0]-a[0]);
for(const [start,end] of ranges) index=index.slice(0,start)+index.slice(end);
const itemImport="import { itemApi } from './item-api';\n";
if(!index.includes(itemImport)) throw new Error('item API import anchor missing');
index=index.replace(itemImport,itemImport+"import { taskApi } from './task-api';\n");
if(index.includes('async function taskApi(')||index.includes('function calendarVisibleFlag(')) throw new Error('task API implementation/helper remained in index.ts');
if(!index.includes("if(url.pathname==='/api/task') return await taskApi(request,context);")) throw new Error('task API route wiring changed');
for(const maybeUnused of [
  ['buildStoredTaskRange',"import { buildStoredTaskRange } from './task-range-safety';\n"],
  ['logTaskCreationCleanupFailure',"import { logNotificationFailure, logRequestFailure, logTaskCreationCleanupFailure } from './observability/errors';"],
]){
  const [name,importText]=maybeUnused;
  const count=(index.match(new RegExp(`\\b${name}\\b`,'g'))||[]).length;
  if(name==='buildStoredTaskRange'&&count===1&&index.includes(importText)) index=index.replace(importText,'');
  if(name==='logTaskCreationCleanupFailure'&&count===1&&index.includes(importText)) index=index.replace(importText,"import { logNotificationFailure, logRequestFailure } from './observability/errors';");
}
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');

if(!index.includes("import { taskApi } from './task-api';")) throw new Error('index.ts must import task API module');
if(index.includes('async function taskApi(')||index.includes('function calendarVisibleFlag(')) throw new Error('task API implementation/helper must not remain in index.ts');
if(!index.includes("if(url.pathname==='/api/task') return await taskApi(request,context);")) throw new Error('task API route wiring changed');
if(!taskApi.includes('export async function taskApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('task API module must export taskApi');
for(const sentinel of [
  "if(request.method==='DELETE')",
  "String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'archiveTaskCompletionStatements',
  'queueCalendarProjectionAfterMutation',
  'wakeCalendarOutbox',
  'buildStoredTaskRange',
  "reminderRaw && /^\\\\d{4}-\\\\d{2}-\\\\d{2}T\\\\d{2}:\\\\d{2}$/",
  "['http:','https:'].includes(parsed.protocol)",
  "visibility_scope,private_owner_id",
  "isPrivate?[m.id]",
  "INSERT OR IGNORE INTO task_assignees(task_id,member_id)",
  "INSERT INTO shopping_items(family_id,name,quantity,category",
  "INSERT INTO items(family_id,name,memo,due_at,status,completion_mode",
  "INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at)",
  'logTaskCreationCleanupFailure',
  "'CREATED','task'",
  "return json({ok:true,id},201)",
]){
  if(!taskApi.includes(sentinel)) throw new Error(\`task API behavior sentinel missing: \${sentinel}\`);
}
console.log('task API modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['item-api-modularity','node scripts/item-api-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest item API anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['task-api-modularity','node scripts/task-api-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

const privacyPath='scripts/worker-error-log-privacy-contract.mjs';
let privacy=fs.readFileSync(privacyPath,'utf8');
const privacyAnchor="const lineWebhook=fs.readFileSync(new URL('../src/line-webhook.ts',import.meta.url),'utf8');\nconst workerOperational=index+lineWebhook;";
if(!privacy.includes(privacyAnchor)) throw new Error('worker privacy contract anchor missing');
privacy=privacy.replace(privacyAnchor,"const lineWebhook=fs.readFileSync(new URL('../src/line-webhook.ts',import.meta.url),'utf8');\nconst taskApi=fs.readFileSync(new URL('../src/task-api.ts',import.meta.url),'utf8');\nconst workerOperational=index+lineWebhook+taskApi;");
fs.writeFileSync(privacyPath,privacy);

const rangeContractPath='scripts/calendar-range-safety-contract.mjs';
let rangeContract=fs.readFileSync(rangeContractPath,'utf8');
const rangeReadAnchor="  const index=source('src/index.ts');\n  const taskNew=source('public/assets/task-new.js');";
if(!rangeContract.includes(rangeReadAnchor)) throw new Error('calendar range contract read anchor missing');
rangeContract=rangeContract.replace(rangeReadAnchor,"  const index=source('src/index.ts');\n  const taskApi=source('src/task-api.ts');\n  const taskNew=source('public/assets/task-new.js');");
const rangeAssert="  assert.match(index,/buildStoredTaskRange/,'task create API must use authoritative range validation');";
if(!rangeContract.includes(rangeAssert)) throw new Error('calendar range contract task create assertion missing');
rangeContract=rangeContract.replace(rangeAssert,"  assert.match(taskApi,/buildStoredTaskRange/,'task create API must use authoritative range validation');");
fs.writeFileSync(rangeContractPath,rangeContract);

const privateContractPath='scripts/private-task-foundation-contract.sh';
let privateContract=fs.readFileSync(privateContractPath,'utf8');
const privateCheck="['migrations/0023_wave83_private_tasks.sql',\"visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'\"],['src/index.ts','private_owner_id'],";
if(!privateContract.includes(privateCheck)) throw new Error('private task contract ownership check anchor missing');
privateContract=privateContract.replace(privateCheck,"['migrations/0023_wave83_private_tasks.sql',\"visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'\"],['src/task-api.ts','private_owner_id'],");
const privateIndexBlock="const index=fs.readFileSync('src/index.ts','utf8');\nif(index.includes('const ids=isPrivate?[]:'))throw new Error('src/index.ts: PRIVATE create must not drop its owner recipient');\nif(!index.includes('const ids=isPrivate?[m.id]:'))throw new Error('src/index.ts: PRIVATE create must assign its owner as the sole recipient scope');\nif(!index.includes('if(reminderAt && ids.length){'))throw new Error('src/index.ts: scheduled task reminders must use the resolved recipient scope');";
if(!privateContract.includes(privateIndexBlock)) throw new Error('private task contract create assertions anchor missing');
privateContract=privateContract.replace(privateIndexBlock,"const taskApi=fs.readFileSync('src/task-api.ts','utf8');\nif(taskApi.includes('const ids=isPrivate?[]:'))throw new Error('src/task-api.ts: PRIVATE create must not drop its owner recipient');\nif(!taskApi.includes('const ids=isPrivate?[m.id]:'))throw new Error('src/task-api.ts: PRIVATE create must assign its owner as the sole recipient scope');\nif(!taskApi.includes('if(reminderAt && ids.length){'))throw new Error('src/task-api.ts: scheduled task reminders must use the resolved recipient scope');");
fs.writeFileSync(privateContractPath,privateContract);

console.log('taskApi extraction patch applied');
