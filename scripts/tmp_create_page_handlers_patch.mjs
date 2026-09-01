import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/create-pages.ts';
const contractPath='scripts/create-pages-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
const source=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const byName=name=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
const taskNode=byName('taskNew');
const itemNode=byName('itemNew');
if(!taskNode||!itemNode) throw new Error('taskNew/itemNew function declaration missing');
const taskText=index.slice(taskNode.getStart(source),taskNode.getEnd());
const itemText=index.slice(itemNode.getStart(source),itemNode.getEnd());
for(const marker of [
  "redirect('/liff?next='+encodeURIComponent('/task/new.php?date='+date))",
  "taskChildVisibilitySql('s')",
  'id="taskNewPayload"',
  '/assets/task-new.js',
  "layout('タスク・イベント追加'",
]) if(!taskText.includes(marker)) throw new Error(`taskNew marker missing: ${marker}`);
for(const marker of [
  "redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date))",
  "taskVisibilitySql('t')",
  'LIMIT 200',
  'privateContext',
  '/assets/item-new.js',
  "layout('持ち物追加'",
]) if(!itemText.includes(marker)) throw new Error(`itemNew marker missing: ${marker}`);
for(const route of [
  "if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');",
  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",
]) if(!index.includes(route)) throw new Error(`create page route missing: ${route}`);

const nodes=[taskNode,itemNode].sort((a,b)=>b.getFullStart()-a.getFullStart());
for(const node of nodes){
  index=index.slice(0,node.getFullStart())+index.slice(node.getEnd());
}
const importAnchor="import { taskDelete } from './task-delete';\n";
if(!index.includes(importAnchor)) throw new Error('taskDelete import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { taskNew, itemNew } from './create-pages';\n");
if(index.includes('async function taskNew(')||index.includes('async function itemNew(')) throw new Error('create-page function remained in index.ts');
fs.writeFileSync(indexPath,index);

const module=`import { redirect } from './response';
import { layout, taskChildVisibilitySql, taskVisibilitySql } from './app';

${taskText.replace('async function taskNew(','export async function taskNew(')}

${itemText.replace('async function itemNew(','export async function itemNew(')}
`;
fs.writeFileSync(modulePath,module);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/create-pages.ts','utf8');
if(!index.includes("import { taskNew, itemNew } from './create-pages';")) throw new Error('index.ts must import create-page handlers');
for(const name of ['taskNew','itemNew']){
  if(index.includes(\`async function \${name}(\`)) throw new Error(\`\${name} must not remain defined in index.ts\`);
  if(!pages.includes(\`export async function \${name}(\`)) throw new Error(\`\${name} export missing\`);
}
for(const route of [
  "if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');",
  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",
]) if(!index.includes(route)) throw new Error(\`create page route wiring changed: \${route}\`);
for(const marker of [
  "taskChildVisibilitySql('s')",
  'id="taskNewPayload"',
  "replaceAll('<','\\u003c')",
  '/assets/task-new.js',
  "layout('タスク・イベント追加'",
  "taskVisibilitySql('t')",
  'LIMIT 200',
  "String(selectedTask?.visibility_scope||'')==='PRIVATE'",
  '/assets/item-new.js',
  "layout('持ち物追加'",
]) if(!pages.includes(marker)) throw new Error(\`create page behavior sentinel missing: \${marker}\`);
console.log('create pages modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['task-delete-modularity','node scripts/task-delete-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('task delete manifest anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['create-pages-modularity','node scripts/create-pages-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('taskNew/itemNew exact AST extraction applied');
