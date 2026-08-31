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

for(const value of [
  'shopping_items',
  'task_id',
  'shopping_assignees',
]) assert.ok(app.includes(value),`server-side task/shopping linkage missing: ${value}`);

assert.ok(!/if\s*\(isEvent\?\.checked\)[^{;]*shopping/i.test(taskNew),'task-new must not discard shopping just because the record is an EVENT');
assert.ok(!/if\s*\(editIsEvent\?\.checked\)[^{;]*shopping/i.test(taskEdit),'task-edit must not discard shopping just because the record is an EVENT');

console.log('task-event-shopping-integration-contract: task/event create, edit, linked child completion, and server linkage remain integrated');
