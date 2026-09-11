import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');
const taskEntryPage=fs.readFileSync('src/task-entry-page.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
const taskEntryManual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const roughUi=fs.readFileSync('public/assets/task-rough-input-ui.js','utf8');
const obsoleteTaskNew='public/assets/'+'task-new.js';

for(const marker of [
  "import { itemNew } from './new-entry-pages';",
  "import { taskEntryPage } from './task-entry-page';",
]) if(!exceptionRoutes.includes(marker)) throw new Error(`exception routes lost unified entry import: ${marker}`);
for(const marker of ['async function taskNew(','async function itemNew(','id="taskNewPayload"','id="itemFormError"']) {
  if(index.includes(marker)) throw new Error(`new page implementation leaked into index: ${marker}`);
}
if(pages.includes('export async function taskNew(')) throw new Error('obsolete taskNew renderer must stay retired');
for(const marker of [
  'export async function itemNew(',
  "SELECT id,title,start_at,due_at,visibility_scope FROM tasks",
  '/assets/item-new.js?v=12.93-wave74',
  'taskVisibilitySql',
  "import { layout } from './app-shell';",
]) if(!pages.includes(marker)) throw new Error(`retained new-entry page behavior marker missing: ${marker}`);
for(const marker of [
  'export async function taskEntryPage(',
  'shopping_category_catalog',
  'resolveShoppingCategoryOptions',
  'CALENDAR_COLOR_OPTIONS.map(option=>',
  'id="taskNewPayload"',
  '/assets/task-rough-input-ui.js?v=${APP_VERSION}',
  '/assets/task-entry-manual.js?v=${APP_VERSION}',
]) if(!taskEntryPage.includes(marker)) throw new Error(`unified task entry page marker missing: ${marker}`);
if(pages.includes("from './app'")||taskEntryPage.includes("from './app'")) throw new Error('new entry pages must not depend on app.ts');
if(pages.includes('SELECT DISTINCT s.category FROM shopping_items')||taskEntryPage.includes('SELECT DISTINCT s.category FROM shopping_items')) throw new Error('create entry must use the canonical family shopping category catalog instead of historical item-derived suggestions');
if(fs.existsSync(obsoleteTaskNew)) throw new Error('obsolete task-new browser controller must stay retired');
if(fs.existsSync('src/client/'+'task-new.ts')) throw new Error('nonexistent legacy task-new source must not be recreated');
for(const marker of [
  "if(url.pathname==='/task/new.php') {",
  "const initialType=url.searchParams.get('event')==='1'?'event':'task';",
  'return await taskEntryPage(',
  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",
]) if(!exceptionRoutes.includes(marker)) throw new Error(`new page route wiring changed: ${marker}`);
for(const marker of [
  "if(payload.returnTo==='calendar')location.href=!body.noDate&&savedDate?'/app/calendar.php?view='+encodeURIComponent(calendarReturnView)+'&month='",
  ":'/app/calendar.php?view='+encodeURIComponent(calendarReturnView);",
  "else location.href=body.noDate?'/app/tasks.php':'/app/tasks.php?date='",
]) if(!taskEntryManual.includes(marker)) throw new Error(`unified task entry calendar return contract changed: ${marker}`);
for(const marker of [
  'AIざっくり入力',
  'name="rough_primary_type" value="task"',
  'name="rough_primary_type" value="event"',
  'name="rough_primary_type" value="shopping"',
  'name="rough_primary_type" value="item"',
  'roughMainInput',
  'roughChildTaskInput',
  'roughShoppingInput',
  'roughItemInput',
  '入力欄そのものが登録先を決めます。',
  '全入力欄を合計して最大4,000文字・20行',
  'このプレビューからはまだ登録されません。',
]) if(!roughUi.includes(marker)) throw new Error(`rough-input split-field safety marker missing: ${marker}`);
for(const oldPrefix of ['子タスク：猫ホテルに連絡','買い物：旅行用シャンプー','持ち物：パスポート','prefixRules']) if(roughUi.includes(oldPrefix)) throw new Error(`rough-input must not require type prefixes: ${oldPrefix}`);
if(roughUi.includes("fetch('/api/task-rough-input'")) throw new Error('visible rough-input UI shell must remain proposal-only; analysis transport belongs to its dedicated controller');
console.log('new entry pages modularity contract ok');
await import('./task-rough-input-shopping-manual-contract.mjs');
await import('./task-rough-input-item-manual-contract.mjs');
