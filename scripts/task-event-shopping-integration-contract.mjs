import assert from 'node:assert/strict';
import fs from 'node:fs';

const taskNew=fs.readFileSync('public/assets/task-new.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const taskView=fs.readFileSync('public/assets/task-view.js','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskNewPage=fs.readFileSync('src/new-entry-pages.ts','utf8');
const taskEditServer=fs.readFileSync('src/task-edit-page.ts','utf8');

for(const value of [
  "document.getElementById('shoppingToggle')",
  'shopping_name[]',
  'shopping_quantity[]',
  'shopping_category[]',
  'shopping_url[]',
  'remove-shopping-row',
  "b.closest('.task-child-row')?.remove()",
  'b.shopping=',
  'b.is_event=Boolean(isEvent?.checked)',
]) assert.ok(taskNew.includes(value),`task-new shopping/event integration missing: ${value}`);
assert.ok(taskNew.includes("category:f.querySelectorAll('[name=\"shopping_category[]\"]')[j]?.value.trim()||''"),'task-new must submit each linked shopping row category independently');
for(const marker of [
  'shopping_category_catalog',
  'resolveShoppingCategoryOptions',
  'task-shopping-category-select',
  'value="__custom__"',
  'task-shopping-category-register',
  'name="shopping_category[]" class="task-shopping-category-value"',
]) assert.ok(taskNewPage.includes(marker),`task-new canonical category selector missing: ${marker}`);
assert.ok(taskNew.includes("fetch('/api/shopping-categories'"),'task-new must opt-in register custom categories through the canonical family category API');
assert.ok(!taskNewPage.includes('datalist id="taskShopCategories"'),'task-new must not derive category suggestions from historical Shopping rows');
assert.ok(!taskNewPage.includes('<select name="shopping_category">'),'task-new must not collapse linked shopping rows into one shared category selector');
assert.ok(taskNewPage.includes('<script src="/assets/task-new.js?v=12.147.0-wave128-rough-input1"></script>'),'task-new page must use the cache-rotated rough-input asset revision');
assert.ok(!taskNewPage.includes('/assets/task-new.js?v=12.147.0-wave128-calendar-return1'),'task-new page must not reuse the pre-category-selector cache key');

for(const value of [
  "document.getElementById('shopToggle')",
  'shopping_id[]',
  'shopping_name[]',
  'shopping_quantity[]',
  'shopping_category[]',
  'shopping_url[]',
  'shopping:[...f.querySelectorAll',
  'is_event:editIsEvent?.checked||false',
]) assert.ok(taskEdit.includes(value),`task-edit shopping/event integration missing: ${value}`);

for(const value of [
  '.task-child-toggle',
  "body:JSON.stringify({type:String(el.dataset.type||''),id:Number(el.dataset.id||0),completed:checked,csrf})",
]) assert.ok(taskView.includes(value),`task-view child completion integration missing: ${value}`);

const shoppingInsertSql=/INSERT INTO shopping_items\(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url\) VALUES\(\?,\?,\?,\?,\?,\?,'pending',\?,\?,\?,\?,\?\)/;
assert.ok(taskEditServer.includes('export async function taskEdit('),'retained task edit server handler must remain identifiable');
assert.ok(!taskEditServer.includes('カテゴリー（全商品共通）'),'task edit must not present linked shopping category as a shared field that collapses mixed categories');
assert.match(taskEditServer,shoppingInsertSql,'task edit must insert new shopping rows with task_id linkage');
assert.match(taskEditServer,/\.bind\(m\.family_id,name,quantity,category,null,noDate\?null:date,m\.id,now,now,id,url\)\.run\(\)/,'task edit shopping insert must bind the edited task id');
assert.match(taskEditServer,/INSERT OR IGNORE INTO shopping_assignees\(shopping_item_id,member_id\)[\s\S]{0,260}?\.bind\(shoppingId2,memberId,m\.family_id\)/,'task edit must preserve shopping assignee linkage');
assert.ok(taskEditServer.includes('existingShopCategoryById=new Map(shops.results.map'), 'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.ok(taskEditServer.includes("Object.prototype.hasOwnProperty.call(row,'category')"), 'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.ok(taskEditServer.includes('rawCategory.length>255'), 'task edit must bound per-item category metadata server-side');
const shoppingCategoryPreflight=taskEditServer.indexOf('const rawShoppingCategories=');
assert.ok(shoppingCategoryPreflight>=0,'task edit shopping category preflight must remain present');
for(const marker of ['UPDATE notifications SET','UPDATE tasks SET','DELETE FROM task_assignees','INSERT OR IGNORE INTO task_assignees']){
  const mutation=taskEditServer.indexOf(marker);
  assert.ok(mutation<0||shoppingCategoryPreflight<mutation,`task edit shopping category validation must precede database mutation: ${marker}`);
}
assert.ok(taskEditServer.includes("String(b.shopping_category||'').trim().length>255"),'legacy shared category fallback must be bounded before database mutations');
assert.ok(taskEditServer.includes("(existingShopCategoryById.get(shoppingId)||fallbackCategory||'')"), 'legacy task edit submissions must preserve each persisted category before using the shared fallback');

// Task creation must persist each submitted shopping row against the newly-created task with its own category.
assert.match(taskApi,shoppingInsertSql,'task creation must insert linked shopping with category support');
assert.ok(taskApi.includes("Object.prototype.hasOwnProperty.call(v||{},'category')"),'task creation must distinguish explicit per-row category values from legacy shared-category submissions');
assert.ok(taskApi.includes("String(v?.category??'').trim().length>255"),'task creation must bound per-row category metadata before database mutation');
const createCategoryPreflight=taskApi.indexOf('const legacyShoppingCategory=');
const createTaskInsert=taskApi.indexOf('INSERT INTO tasks(');
assert.ok(createCategoryPreflight>=0&&createTaskInsert>createCategoryPreflight,'task creation shopping category validation must precede task database mutation');
assert.ok(taskApi.includes("const category=(Object.prototype.hasOwnProperty.call(v||{},'category')?String(v?.category??'').trim():legacyShoppingCategory)||null"),'task creation must prefer the row category while retaining a legacy shared-category fallback');
assert.match(taskApi,/\.bind\(m\.family_id,name,qty,category,null,dueDate,m\.id,now2,now2,id,url\|\|null\)\.run\(\)/,'task creation must bind the newly-created task id and row category into shopping_items');
assert.match(taskApi,/INSERT OR IGNORE INTO shopping_assignees\(shopping_item_id,member_id\)[\s\S]{0,260}?\.bind\(sid,mid,m\.family_id\)/,'task creation linked shopping must preserve assignee linkage');

const submitRegion=(source,startMarker,endMarker)=>{
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,`submission region missing: ${startMarker}`);
  return source.slice(start,end);
};
const taskNewSubmit=submitRegion(taskNew,'f.onsubmit=',"document.documentElement.dataset.taskNewJs='ready'");
const taskEditSubmit=submitRegion(taskEdit,'f.onsubmit=',"document.documentElement.dataset.taskEditJs='ready'");
const eventShoppingDiscard=/if\s*\([^)]*(?:isEvent|editIsEvent)[^)]*\)\s*(?:\{[\s\S]{0,800}?\b(?:b\.)?shopping\s*(?:=|:)|[^;]{0,800}?\b(?:b\.)?shopping\s*(?:=|:))/i;
assert.doesNotMatch(taskNewSubmit,eventShoppingDiscard,'task-new must not discard shopping just because the record is an EVENT');
assert.doesNotMatch(taskEditSubmit,eventShoppingDiscard,'task-edit must not discard shopping just because the record is an EVENT');

console.log('task-event-shopping-integration-contract: task/event create uses canonical family category options with opt-in custom registration while create/edit preserve per-item linked shopping categories, legacy create fallback, removable linked shopping rows, child completion, and concrete server task/shopping linkage');