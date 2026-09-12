import fs from 'node:fs';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');
const taskLink=fs.readFileSync('public/assets/shopping-task-link.js','utf8');
const newJs=fs.readFileSync('public/assets/shopping-new.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  'export async function shopping(request:Request,ctx:AppContext):Promise<Response>{',
  "if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);",
  "action==='to_task'",
  "action==='toggle'",
  "action==='add_batch'",
  "action==='add'",
  'normalized.length>50',
  'INSERT INTO shopping_completion_history',
  'queueCalendarProjectionAfterMutation',
  "String(task.visibility_scope)==='PRIVATE'",
  "return bad('未対応の操作です。');",
]) if(!root.includes(marker)) throw new Error(`Shopping API lost behavior marker: ${marker}`);
for(const marker of ["return html(layout('買い物'",'id="shoppingPayload"','/assets/shopping.js']){
  if(root.includes(marker))throw new Error(`retired standalone Shopping renderer returned: ${marker}`);
}

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { taskVisibilitySql } from './task-visibility';",
  'export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{',
  "status<>'completed'",
  "visibility_scope='FAMILY'",
  'taskOverlapsDate(task,date)',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-2',
  'name="product_name[]"',
  'name="product_quantity[]"',
  'name="product_url[]" maxlength="2048"',
  'id="shoppingNewPayload"',
  '/assets/shopping-new.js?v=${APP_VERSION}',
]) if(!newPage.includes(marker)) throw new Error(`Shopping new page lost behavior marker: ${marker}`);

for(const marker of [
  "categoryRegisterToggle.type='button';",
  "categoryRegisterToggle.textContent='＋ カテゴリを登録';",
  "const registerCategory=categorySelect.value==='__custom__'&&categoryRegister.checked;",
  "fetch('/api/shopping-categories'",
  "const body={action:'add_batch'",
]) if(!newJs.includes(marker)) throw new Error(`Shopping new category behavior lost marker: ${marker}`);

for(const marker of [
  'export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{',
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  "role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id",
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'archiveShoppingCompletionStatements',
  'DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN',
  'return redirect(shoppingChecklistUrl(item.due_date));',
  'return redirect(shoppingChecklistUrl(due||item.due_date));',
  "return html(layout('買い物編集',body,''));",
]) if(!editPage.includes(marker)) throw new Error(`Shopping edit page lost behavior marker: ${marker}`);
if(editPage.includes("return redirect('/app/shopping.php');"))throw new Error('Shopping edit must not return through retired standalone Shopping compatibility URL');

for(const marker of [
  "const payloadNode=document.getElementById('shoppingTaskLinkPayload');",
  "searchInput.id='shoppingTaskSearch';",
  "const matches=query?sorted.filter(task=>normalizeSearch(task.title).includes(query)):[];",
  "dueInput.addEventListener('change',render);",
  "showAllInput.addEventListener('change',render);",
]) if(!taskLink.includes(marker)) throw new Error(`Shopping task-link helper lost behavior marker: ${marker}`);
for(const marker of [
  "const STATIC_CACHE='familytodo-static-shopping-task-fallback';",
  "name.startsWith('familytodo-static-')&&name!==STATIC_CACHE",
  'self.skipWaiting();',
  'await self.clients.claim();',
]) if(!sw.includes(marker)) throw new Error(`Shopping fallback cache rotation missing: ${marker}`);
if(!pkg.includes('node --check public/assets/shopping-task-link.js')) throw new Error('Shopping task-link helper must be covered by browser JS syntax check');

for(const [name,source] of [['root',root],['new',newPage],['edit',editPage]]){
  if(source.includes("from './app'")) throw new Error(`Shopping ${name} retained handler must not depend on app.ts`);
}
if(handlers.includes("export { shopping } from './shopping-root';")) throw new Error('retired standalone Shopping page export must not return');
for(const marker of [
  "export { shoppingNew } from './shopping-new-page';",
  "export { shoppingEdit } from './shopping-edit-page';",
]) if(!handlers.includes(marker)) throw new Error(`Shopping page handler wiring missing: ${marker}`);
if(!apiRoutes.includes("import { shopping } from './shopping-root';")) throw new Error('context API dispatcher must import retained shopping API');
if(!apiRoutes.includes("if(url.pathname==='/api/shopping') return await shopping(request,context);")) throw new Error('/api/shopping route wiring changed');
if(!pageRoutes.includes("import { shoppingNew, shoppingEdit } from './shopping-page-handlers';")) throw new Error('page dispatcher shopping new/edit boundary changed');
for(const marker of [
  "if(url.pathname==='/app/shopping.php'){",
  "return redirect(`/app/tasks.php?date=${encodeURIComponent(date)}#shopping-checklist`);",
  "if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));",
  "if(url.pathname==='/app/shopping_edit.php') return await shoppingEdit(request,context,Number(url.searchParams.get('id')||0));",
]) if(!pageRoutes.includes(marker)) throw new Error(`Shopping page route changed: ${marker}`);

console.log('Shopping API/new/edit boundary contract ok; standalone page remains compatibility-only');
