import assert from 'node:assert/strict';
import fs from 'node:fs';

const colors=fs.readFileSync('src/calendar-colors.ts','utf8');
const page=fs.readFileSync('src/task-entry-page.ts','utf8');
const route=fs.readFileSync('src/exception-routes.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');
const taskView=fs.readFileSync('public/assets/task-view.js','utf8');
const newEntries=fs.readFileSync('src/new-entry-pages.ts','utf8');
const serverNormalize=fs.readFileSync('src/task-rough-input-event-normalize.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const manual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const roughUi=fs.readFileSync('public/assets/task-rough-input-ui.js','utf8');
const roughSave=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const normalize=fs.readFileSync('public/assets/task-rough-input-event-normalize.js','utf8');
const typeUi=fs.readFileSync('public/assets/task-entry-type-ui.js','utf8');
const colorUi=fs.readFileSync('public/assets/calendar-color-ui.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');
const obsoleteTaskNewAsset='/assets/'+'task-new.js';
const obsoleteTaskNewFile='public/assets/'+'task-new.js';

const expectedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b','#f35f8c','#2ecc87','#47b2f7','#b38bdc','#fdc02d','#fb7f77'];
const actualColors=[...colors.matchAll(/value:'(#[0-9a-f]{6})'/gi)].map(match=>match[1].toLowerCase());
assert.deepEqual(actualColors,expectedColors,'calendar color values/order changed');
assert.ok(!colors.includes('TimeTree'),'visible calendar color labels must not include TimeTree');

assert.ok(page.includes('export async function taskEntryPage('),'unified entry page must be canonical renderer');
assert.ok(page.includes('data-task-only="1"'),'task-only manual controls must be explicit');
assert.ok(page.includes('id="taskNoDateWrap"'),'no-deadline control must be addressable by type');
assert.ok(!page.includes('id="isEvent"'),'manual create page must not contain redundant event checkbox');
assert.ok(!page.includes('name="is_event"'),'manual create page must not submit a checkbox-derived event type');
assert.ok(route.includes("import { taskEntryPage } from './task-entry-page';"),'legacy-compatible route must use unified entry page');
assert.ok(route.includes("url.searchParams.get('event')==='1'?'event':'task'"),'event entry link must explicitly preselect EVENT');
assert.ok(taskView.includes("fetch('/api/task?id='+encodeURIComponent(String(id))"),'ordinary task delete must retain the canonical /api/task path');
assert.ok(taskView.includes("fetch('/task/delete.php?id='+encodeURIComponent(String(id))+'&exception_mode='+encodeURIComponent(mode)"),'recurring exception delete must use the lifecycle-aware delete handler');
assert.ok(taskView.includes("exceptionDeleteRestore')?.addEventListener('click',()=>remove('restore'))"),'exception delete UI must preserve restore semantics');
assert.ok(taskView.includes("exceptionDeleteExclude')?.addEventListener('click',()=>remove('exclude'))"),'exception delete UI must preserve exclude semantics');
assert.ok(taskDelete.includes("if(exceptionOrigin&&!['restore','exclude'].includes(exceptionMode))"),'server must reject ambiguous recurring-exception deletion');
assert.ok(taskDelete.includes("exception_task_id=NULL,status='excluded'"),'exclude deletion must detach the exception and keep the occurrence excluded');
assert.ok(taskDelete.includes("exception_task_id=NULL,status=?,completed_by=?,completed_at=?"),'restore deletion must detach the exception and restore occurrence state');

for(const marker of [
  "const mode=primary(),eventMode=mode==='event',taskMode=mode==='task';",
  'if(noDateWrap)noDateWrap.hidden=eventMode;',
  'if(completionWrap)completionWrap.hidden=eventMode;',
  'if(assigneeWrap)assigneeWrap.hidden=eventMode;',
  'dateInput.required=eventMode',
  "is_event:eventMode,",
  "noDate:eventMode?false:Boolean(noDate?.checked),",
  "completion_mode:eventMode?'ANY':",
  'assignees:eventMode?[]:',
])assert.ok(manual.includes(marker),`manual task/event contract missing: ${marker}`);
assert.ok(taskApi.includes("if(isEvent&&!date)return json({ok:false,error:'イベントには日付を指定してください。'},400);"),'server must reject EVENT creation without a date');
assert.ok(roughSave.includes("if(item.destination==='event'&&!item.startDate)return `イベント「${item.title}」には開始日が必要です。`;"),'rough EVENT save must require a start date');
assert.ok(roughSave.includes("noDate:item.destination!=='event'&&!(item.startDate||item.dueDate)"),'rough EVENT save must never use no-deadline mode');

assert.ok(roughUi.includes('name="rough_primary_type" value="event"'),'rough input must expose explicit EVENT primary type');
assert.ok(typeUi.includes("row.dataset.destination!=='event'"),'EVENT rough draft cleanup must key from explicit destination');
assert.ok(typeUi.includes("row.querySelector('.rough-main-assignees')?.remove()"),'EVENT rough draft must omit assignee controls');
assert.ok(typeUi.includes("row.querySelector('.rough-main-completion')?.closest('label')?.remove()"),'EVENT rough draft must omit completion controls');
assert.ok(typeUi.includes('start.required=true'),'EVENT rough draft must mark start date required');
assert.ok(typeUi.includes("setLabelText(start,'開始日（必須）')"),'EVENT rough draft must visibly identify the required start date');
assert.ok(typeUi.includes('@media(max-width:640px)'),'rough detail UI must use an iPhone/LIFF mobile breakpoint');
assert.ok(typeUi.includes('.rough-detail-grid{grid-template-columns:minmax(0,1fr)!important}'),'rough detail fields must stack to one column on mobile');
assert.ok(typeUi.includes("button.textContent='手入力に戻す';"),'AI preview must retain a compact way back to manual entry');
assert.ok(typeUi.includes('manual.hidden=true;'),'successful AI preview must hide the redundant manual form');

assert.ok(normalize.includes("out.push(next,`期限: ${current}`)"),'client date-only EVENT line must become metadata for the following title');
assert.ok(serverNormalize.includes('export function normalizeEventDateTitleText'),'server must own the EVENT date/title semantic normalization contract');
assert.ok(serverNormalize.includes("String(body.primaryType||'')!=='event'"),'server normalization must be scoped to explicit EVENT primary type');
assert.ok(serverNormalize.includes('toIsoDate(current,referenceDate)'),'server normalization must retain a yearless EVENT date without requiring AI');
assert.ok(serverNormalize.includes('DUE_DATE_LINE'),'server normalization must upgrade the client metadata form as well as raw date/title input');
assert.ok(apiRoutes.includes("taskRoughInputApi(await normalizeEventRoughInputRequest(request),context)"),'rough-input API must apply server EVENT normalization before canonical parsing');
const dateOnly=/^(?:\d{4}[\/.\-])?\d{1,2}[\/.\-]\d{1,2}$|^\d{1,2}\s*月\s*\d{1,2}\s*日$/u;
const metadata=/^(?:説明|メモ|備考|note|url|リンク|数量|個数|カテゴリー|カテゴリ|期限|締切)\s*[:：]/iu;
const urlOnly=/^https?:\/\/\S+$/iu;
const normalizeFixture=text=>{
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),out=[];let changed=false;
  for(let i=0;i<lines.length;i++){
    const current=lines[i].trim(),next=i+1<lines.length?lines[i+1].trim():'';
    const title=Boolean(next)&&!dateOnly.test(next)&&!metadata.test(next)&&!urlOnly.test(next);
    if(current&&dateOnly.test(current)&&title){out.push(next,`期限: ${current}`);i++;changed=true;continue;}
    out.push(lines[i]);
  }
  return changed?out.join('\n'):String(text);
};
assert.equal(normalizeFixture('11/12\nゆうき誕生日'),'ゆうき誕生日\n期限: 11/12','date + title must be one semantic event block');
assert.equal(normalizeFixture('11/12\nゆうき誕生日\n11/13\n病院'),'ゆうき誕生日\n期限: 11/12\n病院\n期限: 11/13','multiple date/title pairs must remain multiple events');
assert.equal(normalizeFixture('ゆうき誕生日\n病院'),'ゆうき誕生日\n病院','ordinary multi-event lines must not be merged');
assert.equal(normalizeFixture('11/12\n11/13'),'11/12\n11/13','adjacent date-only lines must not be merged');
assert.equal(normalizeFixture('11/12\n期限: 2026-11-13'),'11/12\n期限: 2026-11-13','date-only line must not consume metadata as a title');

for(const marker of [
  "const STORAGE_KEY='familytodo:lastCalendarColor';",
  "const valid=value=>/^#[0-9a-f]{6}$/i.test(String(value||'').trim());",
  "const isCreatePage=()=>Boolean(document.getElementById('taskNewPayload'))&&!document.getElementById('taskEditForm');",
  "localStorage.setItem(STORAGE_KEY,normalized(value))",
  "select.rough-main-calendar-color",
  "replace(/\\s*[（(]TimeTree[）)]\\s*/gu,'')",
])assert.ok(colorUi.includes(marker),`calendar color UI contract missing: ${marker}`);
assert.ok(shell.includes('/assets/calendar-color-ui.js'),'calendar color UI must load on color forms');
assert.ok(shell.includes("const TASK_ENTRY_UI_REVISION = 'ai-first-ui2-entry-cleanup3';"),'task entry cache revision must invalidate the real-device UI bundle');
const bootstrapIndex=page.indexOf('/assets/task-rough-input-ui.js'),manualIndex=page.indexOf('/assets/task-entry-manual.js');
assert.ok(bootstrapIndex>=0&&manualIndex>bootstrapIndex,'rough input bootstrap must run before manual type binding');
assert.ok(!shell.includes('/assets/task-rough-input-ui.js'),'rough input bootstrap must not be loaded twice');
assert.ok(shell.includes('/assets/task-rough-input-ai.js'),'rough input AI controller must load for unified entry');
assert.ok(shell.includes('/assets/task-rough-input-event-normalize.js'),'event normalization must load with rough input');
assert.ok(shell.includes('/assets/task-entry-type-ui.js'),'explicit type UI cleanup must load with rough input');
assert.ok(pkg.includes('public/assets/task-rough-input-ui.js'),'browser/task checks must include rough input bootstrap');
assert.ok(pkg.includes('public/assets/task-entry-type-ui.js'),'browser/task checks must include explicit type UI cleanup');

assert.ok(!newEntries.includes('taskNew'),'obsolete taskNew renderer must not remain in new-entry-pages');
assert.ok(!shell.includes(obsoleteTaskNewAsset),'app shell must not reference obsolete task-new asset');
assert.ok(!pkg.includes(obsoleteTaskNewFile),'checks must not reference obsolete task-new asset');
assert.equal(fs.existsSync(obsoleteTaskNewFile),false,'obsolete task-new asset must be removed');
assert.equal(fs.existsSync('src/client/task-new.ts'),false,'missing legacy task-new source must not be recreated');
assert.equal(fs.existsSync('.github/EMPTY'),false,'temporary empty GitHub marker must not remain');

console.log('task entry cleanup contract: unified entry routing, required event dates, recurring exception delete semantics, mobile AI detail layout, progressive manual fallback, server/client event grouping, explicit task/event UI semantics, calendar labels/swatches/default memory, and task-new retirement ok');
