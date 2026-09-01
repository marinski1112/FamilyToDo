import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/item-api.ts';
const contractPath='scripts/item-api-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='itemApi');
if(!fn) throw new Error('itemApi declaration not found in current index.ts');
const start=fn.getStart(sourceFile),end=fn.end;
const fnText=index.slice(start,end);
for(const sentinel of [
  "if(request.method!=='POST') return json({ok:false,error:'POST only'},405);",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  "visibility_scope,private_owner_id",
  "INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id)",
  "INSERT OR IGNORE INTO item_assignees(item_id,member_id)",
  "'CREATED','item'",
  "return json({ok:true,id,date:dueDate},201)",
]) if(!fnText.includes(sentinel)) throw new Error(`itemApi source sentinel missing: ${sentinel}`);

const exported=fnText.replace(/^async function itemApi\(/,'export async function itemApi(');
if(exported===fnText) throw new Error('itemApi export rewrite failed');
const nowJst="const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');";
fs.writeFileSync(modulePath,[
  "import { taskVisibilitySql } from './app';",
  "import { json } from './response';",
  '',
  nowJst,
  '',
  exported,
  '',
].join('\n'));

index=index.slice(0,start)+index.slice(end);
const webhookImport="import { webhook } from './line-webhook';\n";
if(!index.includes(webhookImport)) throw new Error('LINE webhook import anchor missing');
index=index.replace(webhookImport,webhookImport+"import { itemApi } from './item-api';\n");
if(index.includes('async function itemApi(')) throw new Error('itemApi remained in index.ts');
if(!index.includes("if(url.pathname==='/api/item') return await itemApi(request,context);")) throw new Error('item API route wiring changed');
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const itemApi=fs.readFileSync('src/item-api.ts','utf8');

if(!index.includes("import { itemApi } from './item-api';")) throw new Error('index.ts must import item API module');
if(index.includes('async function itemApi(')) throw new Error('itemApi must not remain defined in index.ts');
if(!index.includes("if(url.pathname==='/api/item') return await itemApi(request,context);")) throw new Error('item API route wiring changed');
if(!itemApi.includes('export async function itemApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('item API module must export itemApi');
for(const sentinel of [
  "if(request.method!=='POST') return json({ok:false,error:'POST only'},405);",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  "WHERE id=? AND family_id=? AND \\${taskVisibilitySql('t')}",
  "visibility_scope,private_owner_id",
  "INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id)",
  "privateOwner?[privateOwner]",
  "INSERT OR IGNORE INTO item_assignees(item_id,member_id)",
  "'CREATED','item'",
  "return json({ok:true,id,date:dueDate},201)",
]){
  if(!itemApi.includes(sentinel)) throw new Error(\`item API behavior sentinel missing: \${sentinel}\`);
}
console.log('item API modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['line-webhook-modularity','node scripts/line-webhook-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest LINE webhook anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['item-api-modularity','node scripts/item-api-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('itemApi extraction patch applied');
