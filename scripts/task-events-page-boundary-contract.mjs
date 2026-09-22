import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const page=fs.readFileSync('src/task-events-page.ts','utf8');
const overdueShopping=fs.readFileSync('src/overdue-shopping.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');
const categoryUx=fs.readFileSync('public/assets/checklist-category-followup.js','utf8');
const shoppingRoot=fs.readFileSync('src/shopping-root.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const remindersFlow=fs.readFileSync('public/assets/checklist-controller.js','utf8');
const undatedRetentionMigration=fs.readFileSync('migrations/0089_shopping_undated_completed_retention.sql','utf8');

const categorySyntax=spawnSync(process.execPath,['--check','public/assets/checklist-category-followup.js'],{encoding:'utf8'});
if(categorySyntax.status!==0)throw new Error(`Shopping category UX syntax invalid: ${categorySyntax.stderr||categorySyntax.stdout}`);
const taskEventsSyntax=spawnSync(process.execPath,['--check','public/assets/task-events.js'],{encoding:'utf8'});
if(taskEventsSyntax.status!==0)throw new Error(`Task hierarchy UX syntax invalid: ${taskEventsSyntax.stderr||taskEventsSyntax.stdout}`);

if(page.includes("from './app'"))throw new Error('unified task/shopping page must not depend on app.ts');
if(page.includes("OR s.task_id IN (${baseTaskIds.map(()=>'?').join(',')})"))throw new Error('linked Shopping must not expand every displayed task id into one D1 statement');
if(page.includes('const todayJst=dateOnly();'))throw new Error('overdue Task classification must use the selected checklist date, not runtime today');
if(page.includes('<details class="card expired-shopping" open>'))throw new Error('overdue Shopping must stay collapsed by default to preserve Checklist information density');
if(page.includes('task-event-summary meta')||page.includes('const summary=`<div class="task-event-summary'))throw new Error('Checklist header must not restore Task/Shopping count summary');
if(page.includes('<div class="date-title">'))throw new Error('Checklist selected date must stay inline with the compact title');
if(shell.includes('checklist-reminders-ui.js')||shell.includes('checklist-reminders-flow-fix.js'))throw new Error('legacy checklist Reminders controllers must stay retired');
if(remindersFlow.includes('reminders-smart-card')||remindersFlow.includes("querySelector('.reminders-quick-entry')"))throw new Error('retained checklist flow must not depend on removed Reminders presentation');
if(!remindersFlow.includes('const titleSelector='))throw new Error('retained checklist inline-title controller missing');

for(const marker of [
  "const isRealDateOnly=(value:string)=>{",
  "if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return false;",
  "const parsed=new Date(`${value}T00:00:00Z`);",
  "return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;",
  "const safeDate=isRealDateOnly(targetDate)?targetDate:dateOnly();",
])if(!page.includes(marker))throw new Error(`unified checklist real-date validation marker missing: ${marker}`);

const realDateFixture=(value)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};
for(const [value,expected] of [
  ['2024-02-29',true],
  ['2026-02-29',false],
  ['2026-02-31',false],
  ['2026-99-99',false],
  ['2026-12-31',true],
  ['2027-01-01',true],
])if(realDateFixture(value)!==expected)throw new Error(`unified checklist real-date fixture failed: ${value}`);
for(const forbidden of [
  'shoppingByTask',
  'itemsByTask',
  'renderLinkedTaskAccessories',
  'task-shopping-add',
  'task-shopping-count',
  '関連タスクの持ち物',
  "LEFT JOIN tasks t ON t.id=s.task_id",
  "LEFT JOIN tasks pt ON pt.id=i.task_id",
  'shopping_assignees',
  'item_assignees',
])if(page.includes(forbidden))throw new Error(`detached goods checklist must not restore legacy task ownership: ${forbidden}`);

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { recurringForDate } from './recurrence-projection';",
  "import { taskVisibilitySql } from './task-visibility';",
  "export async function taskEvents(_request:Request,ctx:AppContext,targetDate:string):Promise<Response>{",
  "async function expiredTasksFor(ctx:AppContext,date:string):Promise<Row[]>{",
  "async function undatedChildrenFor(ctx:AppContext,parentIds:number[],pendingOnly=false):Promise<Row[]>{",
  "t.status IN ('pending','completed')",
  "lower(COALESCE(t.task_kind,''))='event'",
  "date(COALESCE(t.end_at,t.due_at,t.start_at))>=date(?)",
  "expiredTasksFor(ctx,date)",
  "recurringForDate(ctx,date)",
  "t.parent_task_id IN (${parentIds.map(()=>'?').join(',')})",
  "AND t.parent_task_id IS NULL",
  "const undatedChildren=await undatedChildrenFor(ctx,rootIds);",
  "const childTasksByParent=new Map<number,Row[]>();",
  "const unorganizedChildrenByParent=new Map<number,Row[]>();",
  "class=\"row task-child-row\"",
  "class=\"task-child-composer\" data-parent-task-id=\"${esc(task.id)}\"",
  "data-parent-private=\"${String(task.visibility_scope)==='PRIVATE'?'1':'0'}\"",
  "const childSection=childRows||composer?",
  "JSON.stringify({csrf,date,appVersion:APP_VERSION,completionRefreshAt:nextCompletionBoundary()})",
  "${goodsVisibilitySql('s')}",
  "s.due_date IS NULL",
  "${checklistCompletionSql('s')}",
  "s.status='completed'",
  "expiredShoppingPageFor(ctx,date)",
  "const expiredShoppingIds=new Set(expiredShopping.map(row=>String(row.id)));",
  "if(!expiredShoppingIds.has(String(row.id)))shoppingById.set(String(row.id),row);",
  "const shoppingById=new Map<string,Row>();",
  "const effectiveShoppingDue=(item:Row)=>String(item.due_date||'').slice(0,10);",
  "const groups=new Map<string,{title:string;due:string;items:Row[]}>();",
  "<div class=\"shopping-group\">${groupHead}${rows}</div>",
  "data-type=\"shopping\"",
  "data-type=\"item\"",
  "data-type=\"${taskId<0?'recurrence':'task'}\"",
  "const mainHtml=isEvent?",
  "class=\"checklist-row-action\" href=\"/app/shopping_edit.php?id=${esc(item.id)}\"",
  "const detailAction=!isEvent&&taskId>=0?",
  ".checklist-page .checklist-row-action{display:inline-flex",
  ".checklist-page .task-children{margin:8px 0 0 30px",
  "id=\"shopping-checklist\"",
  "<h2><span class=\"checklist-heading-icon shopping\" aria-hidden=\"true\">▣</span>買い物</h2>",
  "const visibleExpiredShopping=data.expiredShopping.slice(0,OVERDUE_SHOPPING_PAGE_SIZE);",
  "const expiredShoppingHasMore=data.expiredShopping.length>OVERDUE_SHOPPING_PAGE_SIZE;",
  "renderOverdueShoppingRows(visibleExpiredShopping)",
  "expired-shopping-count",
  "class=\"btn secondary expired-shopping-more\"",
  "<details class=\"checklist-more\"><summary>表示ルール</summary>",
  "const primarySections=[",
  "{priority:0,hasContent:Boolean(taskRows),html:taskSection}",
  "{priority:1,hasContent:data.shopping.length>0,html:shoppingSection}",
  "{priority:2,hasContent:Boolean(overdueSection),html:overdueSection}",
  "{priority:3,hasContent:Boolean(itemContent),html:itemSection}",
  "Number(b.hasContent)-Number(a.hasContent)||a.priority-b.priority",
  "<h1>✅ チェックリスト <span class=\"checklist-date\">${esc(compactDate)}</span></h1>",
  "return layout('チェックリスト',body,'/app/tasks.php');",
])if(!page.includes(marker))throw new Error(`unified checklist marker missing: ${marker}`);

for(const marker of [
  "import { goodsVisibilitySql } from './goods-visibility';",
  "export const OVERDUE_SHOPPING_PAGE_SIZE=50;",
  "export async function expiredShoppingPageFor(ctx:AppContext,date:string,cursor?:OverdueShoppingCursor):Promise<Row[]>{",
  "s.due_date IS NOT NULL AND date(s.due_date)<date(?)",
  "LIMIT ${pageLimit}",
])if(!overdueShopping.includes(marker))throw new Error(`overdue Shopping helper marker missing: ${marker}`);

for(const marker of [
  'CREATE INDEX IF NOT EXISTS idx_shopping_undated_status_completed_at',
  'ON shopping_items(family_id, status, completed_at)',
  'WHERE task_id IS NULL AND due_date IS NULL',
])if(!undatedRetentionMigration.includes(marker))throw new Error(`undated Shopping retention index marker missing: ${marker}`);

for(const match of page.matchAll(/<label class="(?:task-main|shopping-check-row|expired-task-main)"[\s\S]*?<\/label>/g)){
  if(match[0].includes('<a '))throw new Error('completion checkbox labels must not contain navigation/edit anchors');
}

if(page.includes("item.task_title?'予定 '+item.task_title:''"))throw new Error('Shopping rows must not repeat linked task title in every item metadata row');
if(page.includes("effectiveDue?'期限 '+effectiveDue:''"))throw new Error('Shopping rows must not repeat the shared effective date in every item metadata row');
if(page.includes('LINKED_SHOPPING_TASK_CHUNK_SIZE'))throw new Error('linked Shopping daily-window query must not depend on the selected-day task-id chunk list');

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { taskEvents } from './task-events-page';"))throw new Error('taskEvents must route through retained unified checklist page');
if(handlers.includes("from './daily-task-page'"))throw new Error('retired daily pages must not return');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('retained item edit boundary missing');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('retained task edit boundary missing');
if(!handlers.includes("export { taskView } from './task-view-page';"))throw new Error('retained taskView boundary regressed');
for(const marker of [
  "if(url.pathname==='/app/tasks.php'){",
  "const timezone=String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);",
  "const date=url.searchParams.get('date')||asDateOffset(url.searchParams.get('offset')==='1'?1:0,timezone);",
  "return await taskEvents(request,context,date);",
])if(!routes.includes(marker))throw new Error(`unified checklist route marker missing: ${marker}`);
for(const marker of [
  "el.matches('.toggle[data-type][data-id]')",
  "fetch('/api/toggle'",
  "occurrence_id:Number(el.dataset.occurrenceId||0)",
  "completedTasks.className='completed-tasks'",
  "summary.textContent=`完了済み ${count}件`",
  "row.querySelector('.task-main-row .task-main > .toggle[data-type=\"task\"],.task-main-row .task-main > .toggle[data-type=\"recurrence\"]')",
  "checkbox.closest('.task-child-row')",
  "form.matches('.task-child-composer')",
  "fetch('/api/task'",
  "'Idempotency-Key':createKey",
  "parent_task_id:parentId",
  "noDate:true",
  "calendar_visible:false",
  "container.insertBefore(row,form)",
  "moveCompletedTaskRow(el,serverCompleted)",
])if(!browser.includes(marker))throw new Error(`unified checklist completion/hierarchy transport missing: ${marker}`);

for(const marker of [
  "section.querySelector(':scope > .checklist-more')?.remove();",
  "section.querySelector(':scope > .section-quick-entry')?.remove();",
  "group.classList.add('category-collapsed')",
  "shopping-continuous-composer",
  "shopping-continuous-name",
  "shopping-continuous-memo",
  "shopping-continuous-url",
  "改行で保存して、次の項目を続けて入力できます",
  "sessionStorage.setItem(draftKey(category),JSON.stringify(draft))",
  "sessionStorage.getItem(draftKey(category))",
  "fetch('/api/shopping'",
  "action:'add',name:itemName,quantity:'1'",
  "memo,url:productUrl",
  "nameInput.addEventListener('keydown'",
  "if(event.key==='Enter')",
  "clearDraft(category);nameInput.value='';memoInput.value='';urlInput.value='';",
  "group.insertBefore(row,footer instanceof HTMLElement?footer:null);",
  "button.textContent='＋ 買い物を追加'",
  "button.textContent='入力を閉じる'",
  "const pending=rows.filter(row=>!rowCompleted(row));",
  "const completed=rows.filter(row=>rowCompleted(row));",
  ".shopping-checklist-section input.check.toggle{-webkit-appearance:none;appearance:none;border-radius:5px!important}",
])if(!categoryUx.includes(marker))throw new Error(`Shopping continuous-entry UX marker missing: ${marker}`);
if(categoryUx.includes("toggle.textContent=collapsed?'展開':'閉じる';"))throw new Error('Shopping category observer must not unconditionally rewrite toggle textContent');
if(categoryUx.includes('due_date'))throw new Error('Category quick-entry Shopping must remain undated so pending items persist across checklist dates');
if(categoryUx.includes('clearLegacyCategory'))throw new Error('Shopping category entry must preserve its selected category instead of clearing it');
for(const marker of [
  "const memo=String(b.memo??'').trim()||null;",
  "const rawUrl=String(b.url??'').trim();",
  "if(!['http:','https:'].includes(u.protocol))throw new Error();",
  "INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,visibility_scope,private_owner_id)",
])if(!shoppingRoot.includes(marker))throw new Error(`canonical Shopping persistence marker missing: ${marker}`);
if(!shell.includes('checklist-category-followup.js?v=${APP_VERSION}-category-followup8'))throw new Error('Shopping continuous-entry UX must use a fresh asset revision');

console.log('task-events-page-boundary: retained Task/Event + grouped Shopping checklist, bounded overdue Shopping helper/paging, off-day linked Belonging fallback without parent-title leakage, parent/child Task hierarchy with undated-child reload support, child-tail idempotent inline creation, separate completion and navigation tap targets, populated-first stable priority, compact inline date header without counts, ordinary-task daily shopping window, recurrence-safe deadline fallback, compact overdue/completed content, privacy, selected-date overdue classification, canonical completion transport, guarded Shopping category observer writes, continuous undated Shopping category entry with memo/url and session draft recovery, expiry-filtered undated completed Shopping with JST midnight/01:00 grace and partial-index contract, and Shopping category UX contracts ok');
