import fs from 'node:fs';

const page=fs.readFileSync('src/task-events-page.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');

if(page.includes("from './app'"))throw new Error('unified task/shopping page must not depend on app.ts');
if(page.includes("OR s.task_id IN (${baseTaskIds.map(()=>'?').join(',')})"))throw new Error('linked Shopping must not expand every displayed task id into one D1 statement');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { recurringForDate } from './recurrence-projection';",
  "import { taskVisibilitySql } from './task-visibility';",
  "export async function taskEvents(_request:Request,ctx:AppContext,targetDate:string):Promise<Response>{",
  "t.status IN ('pending','completed')",
  "lower(COALESCE(t.task_kind,''))='event'",
  "recurringForDate(ctx,date)",
  "(s.task_id IS NULL OR ${taskVisibilitySql('t')})",
  "const LINKED_SHOPPING_TASK_CHUNK_SIZE=80;",
  "Math.ceil(baseTaskIds.length/LINKED_SHOPPING_TASK_CHUNK_SIZE)",
  "baseTaskIds.slice(index*LINKED_SHOPPING_TASK_CHUNK_SIZE,(index+1)*LINKED_SHOPPING_TASK_CHUNK_SIZE)",
  "s.task_id IN (${chunk.map(()=>'?').join(',')})",
  ".bind(member.family_id,member.id,...chunk).all<Row>()",
  "const expiredShoppingIds=new Set(expiredShopping.results.map(row=>String(row.id)));",
  "COALESCE(s.due_date,t.end_at,t.due_at,t.start_at) IS NOT NULL",
  "date(COALESCE(s.due_date,t.end_at,t.due_at,t.start_at)) < date(?)",
  "if(!expiredShoppingIds.has(String(row.id)))shoppingById.set(String(row.id),row);",
  "const shoppingById=new Map<string,Row>();",
  "const effectiveShoppingDue=(item:Row)=>String(item.due_date||item.task_end_at||item.task_due_at||item.task_start_at||'').slice(0,10);",
  "const groups=new Map<string,{title:string;due:string;items:Row[]}>();",
  "const key=taskId&&item.task_title?`${taskId}|${due}`:`item:${String(item.id)}`;",
  "<div class=\"shopping-group-head\"><strong>${esc(group.title)}</strong>",
  "const itemMeta=[item.category||'',item.assignees?'担当 '+item.assignees:'']",
  "<div class=\"shopping-group\">${groupHead}${rows}</div>",
  "data-type=\"shopping\"",
  "data-type=\"item\"",
  "data-type=\"${Number(task.id)<0?'recurrence':'task'}\"",
  "const mainHtml=isEvent?",
  "id=\"shopping-checklist\"",
  "<h2>🛒 買い物</h2>",
  "期限切れ買い物 ${data.expiredShopping.length}件",
  "選択日が期限、またはこの日の予定に紐付く買い物",
  "/app/shopping_new.php?date=",
  "href=\"/app/shopping.php\">一覧・管理</a>",
  "<h1>✅ チェックリスト</h1>",
  "return layout('チェックリスト',body,'/app/tasks.php');",
])if(!page.includes(marker))throw new Error(`unified checklist marker missing: ${marker}`);

if(page.includes("item.task_title?'予定 '+item.task_title:''"))throw new Error('Shopping rows must not repeat linked task title in every item metadata row');
if(page.includes("effectiveDue?'期限 '+effectiveDue:''"))throw new Error('Shopping rows must not repeat the shared effective date in every item metadata row');

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { taskEvents } from './task-events-page';"))throw new Error('taskEvents must route through retained unified checklist page');
if(!handlers.includes("export { today, tomorrow } from './daily-task-page';"))throw new Error('daily pages must route through retained daily task page');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('retained item edit boundary missing');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('retained task edit boundary missing');
if(!handlers.includes("export { taskView } from './task-view-page';"))throw new Error('retained taskView boundary regressed');
if(!routes.includes("if(url.pathname==='/app/tasks.php') return await taskEvents(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));"))throw new Error('unified checklist route changed');
for(const marker of [
  "el.matches('.toggle[data-type][data-id]')",
  "fetch('/api/toggle'",
  "occurrence_id:Number(el.dataset.occurrenceId||0)",
  "completedTasks.className='completed-tasks'",
  "summary.textContent=`完了済み ${count}件`",
  "row.querySelector('.task-main-row .task-main > .toggle[data-type=\"task\"],.task-main-row .task-main > .toggle[data-type=\"recurrence\"]')",
  "moveCompletedTaskRow(el,serverCompleted)",
])if(!browser.includes(marker))throw new Error(`unified checklist completion transport missing: ${marker}`);

console.log('task-events-page-boundary: retained Task/Event + grouped Shopping checklist, compact completed tasks, privacy, bounded D1 linkage, overdue classification and completion transport ok');
