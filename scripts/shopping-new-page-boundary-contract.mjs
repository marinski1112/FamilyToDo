import fs from 'node:fs';

const page=fs.readFileSync('src/shopping-new-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { html, redirect } from './response';",
  "import { taskVisibilitySql } from './task-visibility';",
  "import { validateLiffNext } from './liff-target';",
  "import { APP_VERSION } from './version';",
  'export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{',
  "status<>'completed'",
  "visibility_scope='FAMILY'",
  "taskVisibilitySql('t')",
  'ORDER BY coalesce(start_at,due_at),id LIMIT 200',
  'SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id',
  "privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE'",
  'name="product_name[]"',
  'name="product_quantity[]"',
  'name="product_url[]"',
  'name="category"',
  'name="due_date"',
  'name="assignees"',
  '<input type="hidden" name="task_id" value="${selectedTaskId}">',
  'name="memo"',
  'id="shoppingNewPayload"',
  '/assets/shopping-new.js?v=${APP_VERSION}',
  "return html(layout('買い物を追加',body,'/app/shopping.php'));",
]) if(!page.includes(marker)) throw new Error(`shopping-new page lost behavior marker: ${marker}`);

if(page.includes("from './app'")) throw new Error('shopping-new page must not depend on app.ts');
if(!handlers.includes("export { shopping, shoppingEdit } from './app';")) throw new Error('shopping/shop edit transitional exports changed unexpectedly');
if(!handlers.includes("export { shoppingNew } from './shopping-new-page';")) throw new Error('shopping page handlers must export retained shoppingNew');
const appExport=handlers.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bshoppingNew\b/.test(appExport)) throw new Error('shoppingNew must not remain exported from app.ts');
if(!/\bshopping\b/.test(appExport)||!/\bshoppingEdit\b/.test(appExport)) throw new Error('shopping transitional handlers moved unexpectedly');

if(!routes.includes("import { shopping, shoppingNew, shoppingEdit } from './shopping-page-handlers';")) throw new Error('page dispatcher shopping handler import changed');
if(!routes.includes("if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));")) throw new Error('shopping-new route wiring changed');

console.log('shopping-new retained page boundary contract ok');
