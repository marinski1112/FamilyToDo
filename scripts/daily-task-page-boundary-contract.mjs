import fs from 'node:fs';

const daily=fs.readFileSync('src/daily-task-page.ts','utf8');
const recurrence=fs.readFileSync('src/recurrence-projection.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');

if(daily.includes("from './app'"))throw new Error('today/tomorrow pages must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { recurringForDate } from './recurrence-projection';",
  "import { taskVisibilitySql } from './task-visibility';",
  "export async function today(request:Request,ctx:AppContext,targetDate:string):Promise<Response>",
  "export async function tomorrow(request:Request,ctx:AppContext,targetDate:string):Promise<Response>",
  "t.status IN ('pending','completed')",
  "lower(COALESCE(t.task_kind,''))='event'",
  "recurringForDate(ctx,date)",
  "(i.task_id IS NULL OR ${taskVisibilitySql('pt')})",
  "(s.task_id IS NULL OR ${taskVisibilitySql('t')})",
  "AND ${taskVisibilitySql('t')} AND t.status='pending'",
  "t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL",
  "const mainHtml=isEvent?",
  "data-type=\"${Number(task.id)<0?'recurrence':'task'}\"",
  "data-type=\"shopping\"",
  "data-type=\"item\"",
  "tomorrow?'明日の準備':'今日'",
  "tomorrow?'🌙 明日の準備':'☀️ 今日'",
  "tomorrow?'/tomorrow.php':'/today.php'",
  "/assets/task-events.js?v=${APP_VERSION}",
  "/assets/occurrence-family-log.js?v=${APP_VERSION}",
])if(!daily.includes(marker))throw new Error(`retained daily behavior/privacy marker missing: ${marker}`);

for(const marker of [
  "JOIN members cm ON cm.id=c.member_id AND cm.family_id=o.family_id AND cm.active=1",
  "NOT EXISTS(SELECT 1 FROM task_assignees ta0 JOIN members am0 ON am0.id=ta0.member_id AND am0.active=1 WHERE ta0.task_id=rr.task_id)",
  "EXISTS(SELECT 1 FROM task_assignees ta1 JOIN members am1 ON am1.id=ta1.member_id AND am1.active=1 WHERE ta1.task_id=rr.task_id AND ta1.member_id=c.member_id)",
  "mode=assigned>0?String(rule.completion_mode||'ANY').toUpperCase():'ANY'",
])if(!recurrence.includes(marker))throw new Error(`recurrence completion projection must preserve unassigned family-member completion fallback: ${marker}`);
if(recurrence.includes('JOIN task_assignees ta ON ta.task_id=rr.task_id AND ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE o.family_id=?'))throw new Error('recurrence projection must not discard every completion when a task has no assignees');

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { today, tomorrow } from './daily-task-page';"))throw new Error('today/tomorrow must route through retained daily page');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('item edit retained boundary missing');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('task edit retained boundary missing');
for(const marker of [
  "if(url.pathname==='/today.php') return await today(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));",
  "if(url.pathname==='/tomorrow.php') return await tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));",
])if(!routes.includes(marker))throw new Error(`daily page route changed: ${marker}`);
for(const marker of ["el.matches('.toggle[data-type][data-id]')","fetch('/api/toggle'","occurrence_id:Number(el.dataset.occurrenceId||0)"])if(!browser.includes(marker))throw new Error(`daily completion transport missing: ${marker}`);

console.log('daily-task-page-boundary: today/tomorrow retained outside app.ts with recurrence, unassigned completion fallback and PRIVATE visibility ok');
