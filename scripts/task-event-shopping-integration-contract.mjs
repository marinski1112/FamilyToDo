import assert from 'node:assert/strict';
import fs from 'node:fs';

const taskNew=fs.readFileSync('public/assets/task-new.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const taskView=fs.readFileSync('public/assets/task-view.js','utf8');
const app=fs.readFileSync('src/app.ts','utf8');

for(const value of [
  "document.getElementById('shoppingToggle')",
  'shopping_name[]',
  'shopping_quantity[]',
  'shopping_url[]',
  'b.shopping=',
  'b.is_event=Boolean(isEvent?.checked)',
]) assert.ok(taskNew.includes(value),`task-new shopping/event integration missing: ${value}`);

for(const value of [
  "document.getElementById('shopToggle')",
  'shopping_id[]',
  'shopping_name[]',
  'shopping_quantity[]',
  'shopping_url[]',
  'shopping:[...f.querySelectorAll',
  'is_event:editIsEvent?.checked||false',
]) assert.ok(taskEdit.includes(value),`task-edit shopping/event integration missing: ${value}`);

for(const value of [
  '.task-child-toggle',
  "body:JSON.stringify({type:String(el.dataset.type||''),id:Number(el.dataset.id||0),completed:checked,csrf})",
]) assert.ok(taskView.includes(value),`task-view child completion integration missing: ${value}`);

const shoppingInsertSql=/INSERT INTO shopping_items\(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url\) VALUES\(\?,\?,\?,\?,\?,\?,'pending',\?,\?,\?,\?,\?\)/;
const taskEditStart=app.indexOf('export async function taskEdit(');
const taskEditEnd=app.indexOf('export async function taskApiLegacy(',taskEditStart);
assert.ok(taskEditStart>=0&&taskEditEnd>taskEditStart,'task edit server handler boundaries must remain identifiable');
const taskEditServer=app.slice(taskEditStart,taskEditEnd);
assert.match(taskEditServer,shoppingInsertSql,'task edit must insert new shopping rows with task_id linkage');
assert.match(taskEditServer,/\.bind\(m\.family_id,name,qty,category,null,noDate\?null:date,m\.id,now,now,id,url\)\.run\(\)/,'task edit shopping insert must bind the edited task id');
assert.match(taskEditServer,/INSERT OR IGNORE INTO shopping_assignees\(shopping_item_id,member_id\)[\s\S]{0,240}?\.bind\(sid2,mid,m\.family_id\)/,'task edit must preserve shopping assignee linkage');

// Task creation must persist submitted shopping against the newly-created task, not as an unrelated shopping row.
// Keep this assertion tied to the concrete INSERT/bind shape so unrelated mentions of task_id cannot satisfy the contract.
assert.match(app,/INSERT INTO shopping_items\(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url\) VALUES\(\?,\?,\?,\?,\?,\?,'pending',\?,\?,\?,\?,\?\)[\s\S]{0,320}?\.bind\(m\.family_id,[^)]*?,taskId,(?:url|p\.url\|\|null)\)\.run\(\)/,'task creation must bind a newly-created taskId into shopping_items.task_id');
assert.match(app,/INSERT OR IGNORE INTO shopping_assignees\(shopping_item_id,member_id\)[\s\S]{0,260}?\.bind\([^,]+,mid,m\.family_id\)/,'server-side linked shopping must preserve assignee linkage');

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

console.log('task-event-shopping-integration-contract: task/event create, edit, linked child completion, and concrete server task/shopping linkage remain integrated');
