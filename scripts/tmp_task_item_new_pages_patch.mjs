import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/new-entry-pages.ts';
const contractPath='scripts/new-entry-pages-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

const replaceOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0) throw new Error(`duplicate ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};

let index=fs.readFileSync(indexPath,'utf8');
const start=index.indexOf('async function taskNew(');
const end=index.indexOf('async function processNotifications',start);
if(start<0||end<=start) throw new Error('task/item new page block boundary missing');
const block=index.slice(start,end).trim();
if(!block.includes('async function itemNew(')) throw new Error('itemNew is not inside expected extraction block');
if((block.match(/async function taskNew\(/g)||[]).length!==1||(block.match(/async function itemNew\(/g)||[]).length!==1) throw new Error('unexpected new page function multiplicity');

const moduleSource=`import { redirect } from './response';\nimport { layout, taskVisibilitySql, taskChildVisibilitySql } from './app';\n\n${block
  .replace('async function taskNew(','export async function taskNew(')
  .replace('async function itemNew(','export async function itemNew(')}\n`;
fs.writeFileSync(modulePath,moduleSource);

index=index.slice(0,start)+index.slice(end);
index=replaceOnce(index,"import { makeContext, layout, liffLogin,","import { makeContext, liffLogin,",'layout import');
index=replaceOnce(index,", Forbidden, taskVisibilitySql, taskChildVisibilitySql } from './app';",", Forbidden } from './app';",'task visibility imports');
index=replaceOnce(index,"import { taskDelete } from './task-delete';","import { taskDelete } from './task-delete';\nimport { taskNew, itemNew } from './new-entry-pages';",'new page module import anchor');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';\n\nconst index=fs.readFileSync('src/index.ts','utf8');\nconst pages=fs.readFileSync('src/new-entry-pages.ts','utf8');\n\nif(!index.includes("import { taskNew, itemNew } from './new-entry-pages';")) throw new Error('index must import new page handlers');\nfor(const marker of ['async function taskNew(','async function itemNew(','id=\\"taskNewPayload\\"','id=\\"itemFormError\\"']) {\n  if(index.includes(marker)) throw new Error(\`new page implementation leaked into index: \${marker}\`);\n}\nfor(const marker of [\n  'export async function taskNew(',\n  'export async function itemNew(',\n  "SELECT DISTINCT s.category FROM shopping_items",\n  "SELECT id,title,start_at,due_at,visibility_scope FROM tasks",\n  '/assets/task-new.js?v=12.144.0-wave125',\n  '/assets/item-new.js?v=12.93-wave74',\n  'taskChildVisibilitySql',\n  'taskVisibilitySql',\n]) if(!pages.includes(marker)) throw new Error(\`new page module lost behavior marker: \${marker}\`);\nfor(const route of [\n  "if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');",\n  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",\n]) if(!index.includes(route)) throw new Error(\`new page route wiring changed: \${route}\`);\nconsole.log('new entry pages modularity contract ok');\n`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
manifest=replaceOnce(manifest,"      ['task-delete-modularity','node scripts/task-delete-modularity-contract.mjs'],","      ['task-delete-modularity','node scripts/task-delete-modularity-contract.mjs'],\n      ['new-entry-pages-modularity','node scripts/new-entry-pages-modularity-contract.mjs'],",'regression manifest anchor');
fs.writeFileSync(manifestPath,manifest);

console.log('task/item new pages extraction applied');
