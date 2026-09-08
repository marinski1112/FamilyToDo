import assert from 'node:assert/strict';
import fs from 'node:fs';

const manual=fs.readFileSync('public/assets/task-rough-input-item-manual.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');
const itemJs=fs.readFileSync('public/assets/item-new.js','utf8');
const routes=fs.readFileSync('src/exception-routes.ts','utf8');

assert.doesNotThrow(()=>new Function(manual),'Belongings rough-input manual helper must remain valid browser JavaScript');
for(const marker of [
  "const genericManual=document.getElementById('taskManualFields');",
  "itemManual.id='itemManualFields';",
  "form.insertAdjacentElement('afterend',itemManual);",
  "const url=new URL('/item/new.php',location.origin);",
  "const response=await fetch(url,{headers:{accept:'text/html'}});",
  "new DOMParser().parseFromString(source,'text/html')",
  "const itemForm=doc.getElementById('itemForm');",
  "const errorBox=doc.getElementById('itemFormError');",
  "allowedScriptSrc(doc,'/assets/item-new.js')",
  'body.replaceChildren(errorBox,itemForm);',
  'await loadScript(itemNewSrc);',
  "genericManual.hidden=mode==='shopping'||itemMode;",
  "itemManual.hidden=!itemMode;",
  "itemManual.addEventListener('toggle',()=>{if(itemManual.open)void loadItemManual();});",
  "link.textContent='持ち物追加ページを開く';",
]) assert.ok(manual.includes(marker),`Belongings rough-input manual reuse marker missing: ${marker}`);

assert.equal((manual.match(/fetch\(/g)||[]).length,1,'Belongings manual helper must have one lazy same-origin GET only');
for(const forbidden of ["fetch('/api/item'",'name="name"','name="task_id"','name="assignees"']){
  assert.equal(manual.includes(forbidden),false,`Belongings manual helper must not duplicate canonical item write/form behavior: ${forbidden}`);
}
assert.ok(manual.indexOf("itemManual.addEventListener('toggle'")>manual.indexOf('const loadItemManual='),'manual form fetch must be wired to the Belongings details toggle');
assert.ok(manual.includes("if(itemMode&&itemManual.open)void loadItemManual();"),'switching to Belongings may load only when the manual details is already open');
assert.ok(manual.includes("url.origin===location.origin&&url.pathname===path"),'dynamically loaded item controller must stay same-origin and exact-path constrained');

const helperMarker='/assets/task-rough-input-item-manual.js?v=${APP_VERSION}-item-manual1-${TASK_ENTRY_UI_REVISION}';
assert.ok(shell.includes(helperMarker),'app shell must load the Belongings manual reuse helper on task-new pages');
assert.ok(shell.indexOf('task-rough-input-shopping-manual.js')<shell.indexOf('task-rough-input-item-manual.js'),'Belongings helper must run after Shopping helper so shared generic-manual visibility resolves both specialized modes');

for(const marker of [
  'export async function itemNew(',
  'id="itemFormError"',
  'id="itemForm"',
  'name="task_id"',
  'name="date"',
  'name="memo"',
  'name="assignees"',
  '/assets/item-new.js?v=12.93-wave74',
]) assert.ok(pages.includes(marker),`canonical Belongings page behavior missing: ${marker}`);
for(const marker of [
  "const form=document.getElementById('itemForm');",
  "fetch('/api/item'",
  "credentials:'same-origin'",
  "root.dataset.itemNewJs='ready';",
]) assert.ok(itemJs.includes(marker),`canonical Belongings controller write boundary missing: ${marker}`);
assert.ok(routes.includes("if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));"),'Belongings manual reuse must target the canonical authenticated item-new route');

console.log('rough-input Belongings manual fallback reuses canonical lazy item UI/controller boundary');