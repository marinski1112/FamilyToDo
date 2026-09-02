import fs from 'node:fs';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');
const taskLink=fs.readFileSync('public/assets/shopping-task-link.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
  'export async function shopping(request:Request,ctx:AppContext):Promise<Response>{',
  "action==='to_task'",
  "action==='toggle'",
  "action==='add_batch'",
  "action==='add'",
  'normalized.length>50',
  "INSERT INTO shopping_completion_history",
  "queueCalendarProjectionAfterMutation",
  "status<>'completed'",
  "taskChildVisibilitySql('s')",
  "String(task.visibility_scope)==='PRIVATE'",
  "id=\"shoppingPayload\"",
  '/assets/shopping.js?v=${APP_VERSION}',
  "return html(layout('買い物',body,'/app/shopping.php'));",
]) if(!root.includes(marker)) throw new Error(`Shopping root lost behavior marker: ${marker}`);

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { taskVisibilitySql } from './task-visibility';",
  'export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{',
  "status<>'completed'",
  "visibility_scope='FAMILY'",
  'SELECT id,title,start_at,end_at,due_at,visibility_scope',
  'ORDER BY coalesce(start_at,due_at),id LIMIT 200',
  "privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE'",
  'taskOverlapsDate(task,date)',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-1',
  'name="product_name[]"',
  'name="product_quantity[]"',
  'name="product_url[]"',
  '<input type="hidden" name="task_id" value="${selectedTaskId}">',
  'id="shoppingNewPayload"',
  '/assets/shopping-new.js?v=${APP_VERSION}',
]) if(!newPage.includes(marker)) throw new Error(`Shopping new page lost behavior marker: ${marker}`);

for(const marker of [
  "import { archiveShoppingCompletionStatements } from './lifecycle';",
  "import { taskVisibilitySql } from './task-visibility';",
  "import { APP_VERSION } from './version';",
  'export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{',
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  "role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id",
  'SELECT id,title,start_at,end_at,due_at FROM tasks',
  'taskOverlapsDate(task,dueDate)',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-1',
  "archiveShoppingCompletionStatements",
  "DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN",
  "UPDATE shopping_items SET status=CASE WHEN",
  "return redirect('/app/shopping.php');",
  "return html(layout('買い物編集',body,''));",
]) if(!editPage.includes(marker)) throw new Error(`Shopping edit page lost behavior marker: ${marker}`);

for(const marker of [
  "const payloadNode=document.getElementById('shoppingTaskLinkPayload');",
  "const select=document.getElementById('shoppingTaskId');",
  "const dueInput=document.getElementById('shoppingTaskDueDate');",
  "const showAllInput=document.getElementById('shoppingTaskShowAll');",
  'showAll||overlaps(task,date)||task.id===current||task.id===initialSelected',
  "dueInput.addEventListener('change',render);",
  "showAllInput.addEventListener('change',render);",
  'その他 ${hidden}件はチェックで表示できます。',
]) if(!taskLink.includes(marker)) throw new Error(`Shopping task-link helper lost behavior marker: ${marker}`);
if(!pkg.includes('node --check public/assets/shopping-task-link.js')) throw new Error('Shopping task-link helper must be covered by browser JS syntax check');

for(const [name,source] of [['root',root],['new',newPage],['edit',editPage]]){
  if(source.includes("from './app'")) throw new Error(`Shopping ${name} retained handler must not depend on app.ts`);
}
if(handlers.includes("from './app'")) throw new Error('Shopping page handler boundary must not depend on app.ts');
for(const marker of [
  "export { shopping } from './shopping-root';",
  "export { shoppingNew } from './shopping-new-page';",
  "export { shoppingEdit } from './shopping-edit-page';",
]) if(!handlers.includes(marker)) throw new Error(`Shopping page handler wiring missing: ${marker}`);
if(!apiRoutes.includes("import { shopping } from './shopping-root';")) throw new Error('context API dispatcher must import retained shopping root');
if(!apiRoutes.includes("if(url.pathname==='/api/shopping') return await shopping(request,context);")) throw new Error('/api/shopping route wiring changed');
const appImport=apiRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bshopping\b/.test(appImport)) throw new Error('context API dispatcher must not import shopping from app.ts');
if(!pageRoutes.includes("import { shopping, shoppingNew, shoppingEdit } from './shopping-page-handlers';")) throw new Error('page dispatcher shopping boundary changed');
for(const marker of [
  "if(url.pathname==='/app/shopping.php') return await shopping(request,context);",
  "if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));",
  "if(url.pathname==='/app/shopping_edit.php') return await shoppingEdit(request,context,Number(url.searchParams.get('id')||0));",
]) if(!pageRoutes.includes(marker)) throw new Error(`Shopping page route changed: ${marker}`);

console.log('Shopping retained domain boundary contract ok');
