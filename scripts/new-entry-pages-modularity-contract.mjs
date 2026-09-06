import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
const taskNewJs=fs.readFileSync('public/assets/task-new.js','utf8');

if(!exceptionRoutes.includes("import { taskNew, itemNew } from './new-entry-pages';")) throw new Error('exception routes must import new page handlers');
for(const marker of ['async function taskNew(','async function itemNew(','id="taskNewPayload"','id="itemFormError"']) {
  if(index.includes(marker)) throw new Error(`new page implementation leaked into index: ${marker}`);
}
for(const marker of [
  'export async function taskNew(',
  'export async function itemNew(',
  'shopping_category_catalog',
  'resolveShoppingCategoryOptions',
  "SELECT id,title,start_at,due_at,visibility_scope FROM tasks",
  '/assets/task-new.js?v=12.147.0-wave128-rough-input2',
  '/assets/item-new.js?v=12.93-wave74',
  'taskVisibilitySql',
  "import { layout } from './app-shell';",
]) if(!pages.includes(marker)) throw new Error(`new page module lost behavior marker: ${marker}`);
if(pages.includes("from './app'")) throw new Error('new entry pages must not depend on app.ts');
if(pages.includes('SELECT DISTINCT s.category FROM shopping_items')) throw new Error('task-new must use the canonical family shopping category catalog instead of historical item-derived suggestions');
if(pages.includes('/assets/task-new.js?v=12.147.0-wave128-calendar-return1')) throw new Error('task-new category UX must use a rotated cache key');
for(const route of [
  "if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');",
  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",
]) if(!exceptionRoutes.includes(route)) throw new Error(`new page route wiring changed: ${route}`);
for(const marker of [
  "if(payload.returnTo==='calendar'){",
  "location.href=!b.noDate&&savedDate?'/app/calendar.php?view='+encodeURIComponent(calendarReturnView)+'&month='",
  ":'/app/calendar.php?view='+encodeURIComponent(calendarReturnView);",
  "location.href=b.noDate?'/app/tasks.php':'/app/tasks.php?date='",
]) if(!taskNewJs.includes(marker)) throw new Error(`task-new calendar return contract changed: ${marker}`);
if(taskNewJs.includes("payload.returnTo==='calendar'&&!b.noDate&&savedDate")) throw new Error('calendar-origin no-date tasks must not fall back to Tasks');
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
]) if(!taskNewJs.includes(marker)) throw new Error(`rough-input split-field safety marker missing: ${marker}`);
for(const oldPrefix of ['子タスク：猫ホテルに連絡','買い物：旅行用シャンプー','持ち物：パスポート','prefixRules']) if(taskNewJs.includes(oldPrefix)) throw new Error(`rough-input must not require type prefixes: ${oldPrefix}`);
if(taskNewJs.includes("fetch('/api/task-rough-input'")) throw new Error('visible rough-input preview must remain proposal-only in this bounded stage');
console.log('new entry pages modularity contract ok');