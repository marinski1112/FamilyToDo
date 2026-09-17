import assert from 'node:assert/strict';
import fs from 'node:fs';

const taskEntryPage=fs.readFileSync('src/task-entry-page.ts','utf8');
const taskEntryManual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const roughSave=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const roughAi=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const taskView=fs.readFileSync('public/assets/task-view.js','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskCreate=fs.readFileSync('src/task-create.ts','utf8');
const taskEditServer=fs.readFileSync('src/task-edit-page.ts','utf8');

for(const marker of [
  'shopping_category_catalog',
  'resolveShoppingCategoryOptions',
  'id="taskNewPayload"',
]) assert.ok(taskEntryPage.includes(marker),`unified task entry canonical category bootstrap missing: ${marker}`);
assert.ok(!taskEntryPage.includes('datalist id="taskShopCategories"'),'unified task entry must not derive category suggestions from historical Shopping rows');
for(const marker of ['rough-draft-category','rough-draft-quantity','rough-draft-url','rough-draft-due-date']) assert.ok(roughAi.includes(marker),`rough preview linked shopping field missing: ${marker}`);
for(const marker of [
  "const roots=rows.filter(x=>x.destination==='task'||x.destination==='event')",
  "is_event:item.destination==='event'",
  'for(const item of shopping)await saveShopping(item,parentId,parent.assignees||[])',
  'for(const item of items)await saveItem(item,parentId)',
  'for(const child of children){const result=await saveTask(child,parentId,Boolean(parent.isPrivate))',
]) assert.ok(roughSave.includes(marker),`unified rough-save task/event linkage missing: ${marker}`);
assert.ok(taskEntryManual.includes('shopping:[]')&&taskEntryManual.includes('items:[]'),'manual Task/Event fallback must not invent linked Shopping/Item rows');

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
assert.ok(taskEditServer.includes('existingShopCategoryById=new Map(shops.results.map'),'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.ok(taskEditServer.includes("Object.prototype.hasOwnProperty.call(row,'category')"),'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.ok(taskEditServer.includes('rawCategory.length>255'),'task edit must bound per-item category metadata server-side');
const shoppingCategoryPreflight=taskEditServer.indexOf('const rawShoppingCategories=');
assert.ok(shoppingCategoryPreflight>=0,'task edit shopping category preflight must remain present');
for(const marker of ['UPDATE notifications SET','UPDATE tasks SET','DELETE FROM task_assignees','INSERT OR IGNORE INTO task_assignees']){
  const mutation=taskEditServer.indexOf(marker);
  assert.ok(mutation<0||shoppingCategoryPreflight<mutation,`task edit shopping category validation must precede database mutation: ${marker}`);
}
assert.ok(taskEditServer.includes("String(b.shopping_category||'').trim().length>255"),'legacy shared category fallback must be bounded before database mutations');
assert.ok(taskEditServer.includes("(existingShopCategoryById.get(shoppingId)||fallbackCategory||'')"),'legacy task edit submissions must preserve each persisted category before using the shared fallback');

// Create input validation stays in task-api; persistence is owned by the atomic task-create writer.
assert.ok(taskApi.includes("Object.prototype.hasOwnProperty.call(v||{},'category')"),'task creation must distinguish explicit per-row category values from legacy shared-category submissions');
assert.ok(taskApi.includes("String(v?.category??'').trim().length>255"),'task creation must bound per-row category metadata before database mutation');
const createCategoryPreflight=taskApi.indexOf('const legacyShoppingCategory=');
const createWriterCall=taskApi.indexOf('createTaskIdempotently(ctx.env.DB');
assert.ok(createCategoryPreflight>=0&&createWriterCall>createCategoryPreflight,'task creation shopping category validation must precede the atomic database writer');
assert.ok(taskApi.includes("const category=(Object.prototype.hasOwnProperty.call(v||{},'category')?String(v?.category??'').trim():legacyShoppingCategory)||null"),'task creation must prefer the row category while retaining a legacy shared-category fallback');
assert.ok(taskCreate.includes('INSERT INTO shopping_items(\n      family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url'),'atomic task creation must insert linked shopping with category support');
assert.ok(taskCreate.includes("NULLIF(CAST(json_extract(j.value,'$.category') AS TEXT),'')"),'atomic task creation must persist each row category');
assert.ok(taskCreate.includes("NULLIF(CAST(json_extract(j.value,'$.url') AS TEXT),'')"),'atomic task creation must persist each row URL');
assert.ok(taskCreate.includes('JOIN task_create_requests r ON r.id=t.create_request_id'),'linked shopping must resolve the task through the guarded create request');
assert.ok(taskCreate.includes('JOIN shopping_items s ON s.task_id=t.id AND s.family_id=t.family_id'),'linked shopping assignees must remain scoped to the newly-created task and family');
assert.ok(taskCreate.includes('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id)'),'task creation linked shopping must preserve assignee linkage');
assert.ok(taskCreate.includes("m.id=CAST(a.value AS INTEGER) AND m.family_id=? AND m.active=1"),'linked shopping assignees must be active members of the same family');

const submitRegion=(source,startMarker,endMarker)=>{
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,`submission region missing: ${startMarker}`);
  return source.slice(start,end);
};
const taskEditSubmit=submitRegion(taskEdit,'f.onsubmit=',"document.documentElement.dataset.taskEditJs='ready'");
const eventShoppingDiscard=/if\s*\([^)]*(?:isEvent|editIsEvent)[^)]*\)\s*(?:\{[\s\S]{0,800}?\b(?:b\.)?shopping\s*(?:=|:)|[^;]{0,800}?\b(?:b\.)?shopping\s*(?:=|:))/i;
assert.doesNotMatch(taskEditSubmit,eventShoppingDiscard,'task-edit must not discard shopping just because the record is an EVENT');
assert.ok(!roughSave.includes("item.destination==='event'?[]"),'rough EVENT save must not discard related rows solely because the root is EVENT');

console.log('task-event-shopping-integration-contract: unified Task/Event create and retained edit preserve canonical category handling, linked Shopping/Item behavior, child completion, and atomic server task/shopping linkage');
