import fs from 'node:fs';

const page=fs.readFileSync('src/task-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-edit.js','utf8');
const hierarchyGuard=fs.readFileSync('src/task-edit-hierarchy-guard.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { reconcileTaskCompletionAfterAssigneeChange } from './task-completion-reconciliation';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "taskVisibilitySql",
  "SELECT t.* FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1",
  "visibility_scope=?,private_owner_id=?",
  "if(isEvent)await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?')",
  "if(!isEvent)await reconcileTaskCompletionAfterAssigneeChange(ctx.env.DB,m.family_id,id,now);",
  "queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id)",
  '<h1>📝 タスク・イベント編集</h1>',
  'id="editIsPrivate"',
])if(!page.includes(marker))throw new Error(`task edit marker missing: ${marker}`);

for(const forbidden of [
  'id="shopRows"','id="itemRows"','shopping_name[]','item_name[]',
  'SELECT id,name,quantity,url,category,status FROM shopping_items WHERE task_id=?',
  "SELECT id,name,status FROM items WHERE task_id=?",
  'rawShoppingCategories','shopping_category',
  'DELETE FROM shopping_assignees WHERE shopping_item_id=?','DELETE FROM item_assignees WHERE item_id=?',
  'reconcileShoppingCompletionAfterAssigneeChange','reconcileItemCompletionAfterAssigneeChange',
])if(page.includes(forbidden))throw new Error(`task edit must not manage goods linkage: ${forbidden}`);

for(const forbidden of ['shopping:[...f.querySelectorAll','items:[...f.querySelectorAll','shopping_category','shopToggle','shopping_name[]','item_name[]'])if(browser.includes(forbidden))throw new Error(`task edit browser must not transport goods linkage: ${forbidden}`);
for(const marker of ["const f=document.getElementById('taskEditForm')","fetch(location.href,{method:'POST'"])if(!browser.includes(marker))throw new Error(`task edit browser transport missing: ${marker}`);

if(handlers.includes("from './app'"))throw new Error('task page handlers must not depend on app.ts');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('taskEdit must route through retained task edit page');
for(const marker of ["if(url.pathname==='/task/edit.php'){",'validateTaskEditRequestHierarchy(request,context,taskId)','return await taskEdit(request,context,taskId);'])if(!routes.includes(marker))throw new Error(`task edit guarded route missing: ${marker}`);
for(const marker of ['export async function validateTaskEditRequestHierarchy(',"if(request.method!=='POST')return {ok:true};","if(requestedEvent)return {ok:false,status:400,message:'子タスクはイベントに変更できません。'};"])if(!hierarchyGuard.includes(marker))throw new Error(`task edit hierarchy mutation guard missing: ${marker}`);

if(page.includes('name="assignees"')||browser.includes('child-task-assignees'))throw new Error('retired assignee UI must stay absent');
console.log('task-edit-page-boundary: Task/Event editing retains privacy controls and no assignee UI or linked goods');
