import assert from 'node:assert/strict';
import fs from 'node:fs';

const taskEntryPage=fs.readFileSync('src/task-entry-page.ts','utf8');
const taskEntryManual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const roughSave=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const roughAi=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const taskView=fs.readFileSync('public/assets/task-view.js','utf8');
const taskEditServer=fs.readFileSync('src/task-edit-page.ts','utf8');
const taskViewServer=fs.readFileSync('src/task-view-page.ts','utf8');
assert.doesNotMatch(roughSave,/rough-item-assignees/,'Belongings draft reader must not retain retired assignee inputs');

for(const marker of ['shopping_category_catalog','resolveShoppingCategoryOptions','id="taskNewPayload"'])assert.ok(taskEntryPage.includes(marker),`unified task entry canonical category bootstrap missing: ${marker}`);
for(const marker of ['rough-draft-category','rough-draft-quantity','rough-draft-url','rough-draft-due-date'])assert.ok(roughAi.includes(marker),`rough preview shopping field missing: ${marker}`);
for(const marker of [
  "const roots=rows.filter(x=>x.destination==='task'||x.destination==='event')",
  'for(const item of shopping){await saveShopping(item);savedGoods++;}',
  'for(const item of items){await saveItem(item);savedGoods++;}',
  'for(const child of children){const result=await saveTask(child,createdTaskIds[0],Boolean(roots[0]?.isPrivate));',
])assert.ok(roughSave.includes(marker),`rough save must retain independent goods behavior: ${marker}`);
for(const forbidden of ['parentId,parent.assignees','saveShopping(item,parentId','saveItem(item,parentId','task_id:parentId'])assert.ok(!roughSave.includes(forbidden),`rough save must not restore goods linkage: ${forbidden}`);
assert.ok(taskEntryManual.includes('shopping:[]')&&taskEntryManual.includes('items:[]'),'manual Task/Event fallback must not invent linked Shopping/Item rows');

for(const forbidden of ['shopToggle','shopping_id[]','shopping_name[]','shopping_quantity[]','shopping_category[]','shopping_url[]','shopping:[...f.querySelectorAll','items:[...f.querySelectorAll'])assert.ok(!taskEdit.includes(forbidden),`task edit must not expose goods linkage: ${forbidden}`);
assert.ok(!taskEditServer.includes('INSERT INTO shopping_items('),'task edit server must not create linked shopping');
assert.ok(!taskEditServer.includes('INSERT INTO items('),'task edit server must not create linked belongings');
for(const forbidden of ['.task-child-toggle',"type:String(el.dataset.type||'')",'data-type="shopping"','data-type="item"'])assert.ok(!taskView.includes(forbidden),`task-view client must not retain linked-goods completion controls: ${forbidden}`);
for(const forbidden of ['FROM shopping_items s WHERE s.task_id=?','FROM items i WHERE i.task_id=?','/shopping/new.php?task_id=','/item/new.php?task_id='])assert.ok(!taskViewServer.includes(forbidden),`task-view server must not retain linked-goods projection: ${forbidden}`);
assert.ok(taskView.includes('/api/task-children?parent_id='),'task-view must retain direct child-task navigation independently of goods');

console.log('task-event-shopping-integration-contract: Task/Event and independent goods entry stay unified without creating, editing, viewing or toggling task-linked goods');