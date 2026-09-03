import fs from 'node:fs';

const page=fs.readFileSync('src/task-edit-page.ts','utf8');
const reconciliation=fs.readFileSync('src/task-completion-reconciliation.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-edit.js','utf8');

if(page.includes("from './app'"))throw new Error('task edit page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "archiveItemCompletionStatements, archiveShoppingCompletionStatements",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { reconcileTaskCompletionAfterAssigneeChange } from './task-completion-reconciliation';",
  "import { buildStoredTaskRange } from './task-range-safety';",
  "taskChildVisibilitySql, taskVisibilitySql",
  "export async function taskEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{",
  "SELECT t.* FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1",
  ".bind(id,member.family_id,member.id).first<Row>()",
  "return new Response('タスクが見つかりません。',{status:404});",
  "role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id",
  "他のメンバーが作成した共有タスクを自分専用にはできません。",
  "buildStoredTaskRange({noDate,allDay:allDayRequested,startDate:date,endDate,startTime,endTime,requireTimedStart:!allDayRequested})",
  "DELETE FROM activity_logs WHERE family_id=?",
  "visibility_scope=?,private_owner_id=?",
  "makePrivate?[m.id]",
  "if(isEvent)await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?')",
  "if(!isEvent)await reconcileTaskCompletionAfterAssigneeChange(ctx.env.DB,m.family_id,id,now);",
  "DELETE FROM shopping_assignees WHERE shopping_item_id=?",
  "DELETE FROM item_assignees WHERE item_id=?",
  "UPDATE shopping_items SET status=CASE WHEN",
  "UPDATE items SET status=CASE WHEN",
  "UPDATE notifications SET status='cancelled'",
  "INSERT OR IGNORE INTO notifications",
  "...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,shoppingId,now)",
  "...archiveItemCompletionStatements(ctx.env.DB,m.family_id,itemId,now)",
  "queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id)",
  "return redirect(`/task/view.php?id=${id}`);",
  "<h1>📝 タスク・イベント編集</h1>",
  "id=\"editIsPrivate\"",
  "id=\"shopRows\"",
  "id=\"itemRows\"",
  "/assets/task-edit.js?v=${APP_VERSION}",
])if(!page.includes(marker))throw new Error(`retained task edit behavior/privacy marker missing: ${marker}`);

if(page.includes("DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT member_id FROM task_assignees"))throw new Error('task edit must not purge zero-assignee family completion rows inline');
if(page.includes('UPDATE tasks SET status=CASE WHEN (SELECT COUNT(*) FROM task_assignees'))throw new Error('task edit must use canonical completion reconciliation instead of zero-assignee pending fallback');

for(const marker of [
  'export async function reconcileTaskCompletionAfterAssigneeChange(',
  'SELECT completion_mode FROM tasks WHERE id=? AND family_id=? LIMIT 1',
  'const assignedCount=Number(assigned?.c||0);',
  'DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT ta.member_id FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?)',
  'DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT id FROM members WHERE family_id=? AND active=1)',
  'JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  "const mode=assignedCount>0?String(task.completion_mode||'ANY').toUpperCase():'ANY';",
  'ORDER BY tc.completed_at DESC,tc.member_id DESC LIMIT 1',
  'UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?',
])if(!reconciliation.includes(marker))throw new Error(`task completion reconciliation marker missing: ${marker}`);

if(handlers.includes("from './app'"))throw new Error('task page handlers must not depend on app.ts after task edit extraction');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('taskEdit must route through retained task edit page');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('retained item edit boundary regressed');
if(!routes.includes("if(url.pathname==='/task/edit.php') return await taskEdit(request,context,Number(url.searchParams.get('id')||0));"))throw new Error('task edit route changed');
for(const marker of [
  "const f=document.getElementById('taskEditForm')",
  "fetch(location.href,{method:'POST'",
  "shopping:[...f.querySelectorAll('[name=\"shopping_name[]\"]')].map",
  "items:[...f.querySelectorAll('[name=\"item_name[]\"]')].map",
])if(!browser.includes(marker))throw new Error(`task edit browser transport missing: ${marker}`);

console.log('task-edit-page-boundary: retained Task/Event edit ownership, canonical task completion reconciliation, PRIVATE conversion, child lifecycle and projection semantics ok');
