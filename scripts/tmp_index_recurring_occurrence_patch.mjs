import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/recurring-occurrence.ts';
const contractPath='scripts/recurring-occurrence-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='convertOccurrence');
if(!fn) throw new Error('convertOccurrence declaration not found in current index.ts');
const fnText=index.slice(fn.getStart(sourceFile),fn.end);

for(const sentinel of [
  "if(request.method!=='POST')",
  "ct.includes('application/json')",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'const occId=Number(b.occurrence_id||0)',
  'occ.exception_task_id',
  'INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode',
  "'OCCURRENCE'",
  'INSERT OR IGNORE INTO task_assignees(task_id,member_id)',
  'INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at)',
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  'SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id)',
  'SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO item_assignees(item_id,member_id)',
  'UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=?',
  'redirectTo=`/task/view.php?id=${taskId}`',
]) if(!fnText.includes(sentinel)) throw new Error(`convertOccurrence source sentinel missing: ${sentinel}`);

const route="if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);";
if(!index.includes(route)) throw new Error('convert occurrence route wiring missing');

const exported=fnText.replace(/^async function convertOccurrence\(/,'export async function convertOccurrence(');
if(exported===fnText) throw new Error('convertOccurrence export rewrite failed');
const nowJst="const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');";
fs.writeFileSync(modulePath,[
  "import { json, redirect } from './response';",
  '',
  nowJst,
  '',
  exported,
  '',
].join('\n'));

index=index.slice(0,fn.getStart(sourceFile))+index.slice(fn.end);
const importAnchor="import { taskApi } from './task-api';\n";
if(!index.includes(importAnchor)) throw new Error('task API import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { convertOccurrence } from './recurring-occurrence';\n");
if(index.includes('async function convertOccurrence(')) throw new Error('convertOccurrence implementation remained in index.ts');
if(!index.includes(route)) throw new Error('convert occurrence route wiring changed');
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const occurrence=fs.readFileSync('src/recurring-occurrence.ts','utf8');

if(!index.includes("import { convertOccurrence } from './recurring-occurrence';")) throw new Error('index.ts must import recurring occurrence module');
if(index.includes('async function convertOccurrence(')) throw new Error('convertOccurrence implementation must not remain in index.ts');
if(!index.includes("if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);")) throw new Error('convert occurrence route wiring changed');
if(!occurrence.includes('export async function convertOccurrence(request:Request,ctx:any):Promise<Response>{')) throw new Error('recurring occurrence module must export convertOccurrence');
for(const sentinel of [
  "if(request.method!=='POST')",
  "ct.includes('application/json')",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'const occId=Number(b.occurrence_id||0)',
  'occ.exception_task_id',
  'INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode',
  "'OCCURRENCE'",
  'INSERT OR IGNORE INTO task_assignees(task_id,member_id)',
  'INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at)',
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)',
  'SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id)',
  'SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id',
  'INSERT OR IGNORE INTO item_assignees(item_id,member_id)',
  'UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=?',
  'redirectTo=\`/task/view.php?id=\${taskId}\`',
]) if(!occurrence.includes(sentinel)) throw new Error(\`recurring occurrence behavior sentinel missing: \${sentinel}\`);
console.log('recurring occurrence modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const manifestAnchor="      ['task-api-modularity','node scripts/task-api-modularity-contract.mjs'],\n";
if(!manifest.includes(manifestAnchor)) throw new Error('regression manifest task API anchor missing');
manifest=manifest.replace(manifestAnchor,manifestAnchor+"      ['recurring-occurrence-modularity','node scripts/recurring-occurrence-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('convertOccurrence extraction patch applied');
