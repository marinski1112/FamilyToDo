import assert from 'node:assert/strict';
import fs from 'node:fs';

const manual=fs.readFileSync('public/assets/task-rough-input-shopping-manual.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const shoppingPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const shoppingJs=fs.readFileSync('public/assets/shopping-new.js','utf8');
const taskLinkJs=fs.readFileSync('public/assets/shopping-task-link.js','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');

assert.doesNotThrow(()=>new Function(manual),'Shopping rough-input manual helper must remain valid browser JavaScript');
for(const marker of [
  "const genericManual=document.getElementById('taskManualFields');",
  "shoppingManual.id='shoppingManualFields';",
  "form.insertAdjacentElement('afterend',shoppingManual);",
  "const url=new URL('/app/shopping_new.php',location.origin);",
  "const response=await fetch(url,{headers:{accept:'text/html'}});",
  "new DOMParser().parseFromString(source,'text/html')",
  "const card=doc.getElementById('addShopping');",
  "const shoppingPayload=doc.getElementById('shoppingNewPayload');",
  "const taskPayload=doc.getElementById('shoppingTaskLinkPayload');",
  "allowedScriptSrc(doc,'/assets/shopping-task-link.js')",
  "allowedScriptSrc(doc,'/assets/shopping-new.js')",
  'body.replaceChildren(card,shoppingPayload);',
  'if(taskPayload)await loadScript(taskLinkSrc);',
  'await loadScript(shoppingNewSrc);',
  "genericManual.hidden=shoppingMode;",
  "shoppingManual.hidden=!shoppingMode;",
  "shoppingManual.addEventListener('toggle',()=>{if(shoppingManual.open)void loadShoppingManual();});",
  "link.textContent='買い物追加ページを開く';",
]) assert.ok(manual.includes(marker),`Shopping rough-input manual reuse marker missing: ${marker}`);

assert.equal((manual.match(/fetch\(/g)||[]).length,1,'Shopping manual helper must have one lazy same-origin GET only');
for(const forbidden of ["fetch('/api/shopping'","fetch('/api/shopping-categories'",'name="product_name[]"','name="product_quantity[]"']){
  assert.equal(manual.includes(forbidden),false,`Shopping manual helper must not duplicate canonical Shopping write/form behavior: ${forbidden}`);
}
assert.ok(manual.indexOf("shoppingManual.addEventListener('toggle'")>manual.indexOf('const loadShoppingManual='),'manual form fetch must be wired to the Shopping details toggle');
assert.ok(manual.includes("if(shoppingMode&&shoppingManual.open)void loadShoppingManual();"),'switching to Shopping may load only when the manual details is already open');
assert.ok(manual.includes("url.origin===location.origin&&url.pathname===path"),'dynamically loaded Shopping controllers must stay same-origin and exact-path constrained');

const helperMarker='/assets/task-rough-input-shopping-manual.js?v=${APP_VERSION}-shopping-manual1-${TASK_ENTRY_UI_REVISION}';
assert.ok(shell.includes(helperMarker),'app shell must load the Shopping manual reuse helper on task-new pages');
assert.ok(shell.indexOf('task-rough-input-save.js')<shell.indexOf('task-rough-input-shopping-manual.js'),'Shopping manual helper must run after rough-input initialization/save enhancement');

for(const marker of [
  'id="shopBatchForm"',
  'id="shoppingProducts"',
  'id="shoppingCategorySelect"',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingNewPayload"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}',
  '/assets/shopping-new.js?v=${APP_VERSION}',
]) assert.ok(shoppingPage.includes(marker),`canonical Shopping page behavior missing: ${marker}`);
for(const marker of [
  "fetch('/api/shopping'",
  "fetch('/api/shopping-categories'",
  "const body={action:'add_batch'",
]) assert.ok(shoppingJs.includes(marker),`canonical Shopping controller write boundary missing: ${marker}`);
assert.ok(taskLinkJs.includes("const DEFAULT_VISIBLE_LIMIT=12;"),'canonical Shopping related-task picker must remain bounded by default');
assert.ok(taskLinkJs.includes("searchInput.type='search';"),'canonical Shopping related-task picker must retain search');
assert.ok(pageRoutes.includes("if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));"),'Shopping manual reuse must target the canonical authenticated Shopping-new route');

console.log('rough-input Shopping manual fallback reuses canonical lazy Shopping UI/controller boundary');