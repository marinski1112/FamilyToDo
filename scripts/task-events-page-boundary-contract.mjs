import fs from 'node:fs';

const page=fs.readFileSync('src/task-events-page.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');

if(page.includes("from './app'"))throw new Error('unified task/shopping page must not depend on app.ts');
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
  "OR s.task_id IN (${baseTaskIds.map(()=>'?').join(',')})",
  "data-type=\"shopping\"",
  "data-type=\"item\"",
  "data-type=\"${Number(task.id)<0?'recurrence':'task'}\"",
  "const mainHtml=isEvent?",
  "id=\"shopping-checklist\"",
  "<h2>🛒 買い物</h2>",
  "選択日が期限、またはこの日の予定に紐付く買い物",
  "/app/shopping_new.php?date=",
  "href=\"/app/shopping.php\">一覧・管理</a>",
  "<h1>✅ チェックリスト</h1>",
  "return layout('チェックリスト',body,'/app/tasks.php');",
])if(!page.includes(marker))throw new Error(`unified checklist marker missing: ${marker}`);

if(!handlers.includes("export { taskEvents } from './task-events-page';"))throw new Error('taskEvents must route through retained unified checklist page');
if(!handlers.includes("export { today, tomorrow, taskEdit, itemEdit } from './app';"))throw new Error('unmigrated task page handlers changed unexpectedly');
if(!handlers.includes("export { taskView } from './task-view-page';"))throw new Error('retained taskView boundary regressed');
if(!routes.includes("if(url.pathname==='/app/tasks.php') return await taskEvents(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));"))throw new Error('unified checklist route changed');
for(const marker of ["el.matches('.toggle[data-type][data-id]')","fetch('/api/toggle'","occurrence_id:Number(el.dataset.occurrenceId||0)"])if(!browser.includes(marker))throw new Error(`unified checklist completion transport missing: ${marker}`);

console.log('task-events-page-boundary: retained Task/Event + Shopping checklist, privacy and completion transport ok');
