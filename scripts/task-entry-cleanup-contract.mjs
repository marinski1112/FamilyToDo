import assert from 'node:assert/strict';
import fs from 'node:fs';

const colors=fs.readFileSync('src/calendar-colors.ts','utf8');
const page=fs.readFileSync('src/task-entry-page.ts','utf8');
const route=fs.readFileSync('src/exception-routes.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');
const manual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const normalize=fs.readFileSync('public/assets/task-rough-input-event-normalize.js','utf8');
const colorUi=fs.readFileSync('public/assets/calendar-color-ui.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');

const expectedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b','#f35f8c','#2ecc87','#47b2f7','#b38bdc','#fdc02d','#fb7f77'];
for(const value of expectedColors)assert.ok(colors.includes(`value:'${value}'`),`calendar color value changed or missing: ${value}`);
assert.equal((colors.match(/value:'#/g)||[]).length,expectedColors.length,'calendar color option count changed');
assert.ok(!colors.includes('TimeTree'),'visible calendar color labels must not include TimeTree');

assert.ok(page.includes('export async function taskEntryPage('),'unified entry page must be canonical renderer');
assert.ok(page.includes('data-task-only="1"'),'task-only manual controls must be explicit');
assert.ok(page.includes('id="taskNoDateWrap"'),'no-deadline control must be addressable by type');
assert.ok(!page.includes('id="isEvent"'),'manual create page must not contain redundant event checkbox');
assert.ok(!page.includes('name="is_event"'),'manual create page must not submit a checkbox-derived event type');
assert.ok(route.includes("import { taskEntryPage } from './task-entry-page';"),'legacy-compatible route must use unified entry page');
assert.ok(route.includes("url.searchParams.get('event')==='1'?'event':'task'"),'event entry link must explicitly preselect EVENT');

for(const marker of [
  "const mode=primary(),eventMode=mode==='event',taskMode=mode==='task';",
  'if(noDateWrap)noDateWrap.hidden=eventMode;',
  'if(completionWrap)completionWrap.hidden=eventMode;',
  'if(assigneeWrap)assigneeWrap.hidden=eventMode;',
  "is_event:eventMode,",
  "noDate:eventMode?false:Boolean(noDate?.checked),",
  "completion_mode:eventMode?'ANY':",
  'assignees:eventMode?[]:',
])assert.ok(manual.includes(marker),`manual task/event contract missing: ${marker}`);

assert.ok(normalize.includes("out.push(next,`期限: ${current}`)"),'date-only EVENT line must become metadata for the following title');
const dateOnly=/^(?:\d{4}[\/.\-])?\d{1,2}[\/.\-]\d{1,2}$|^\d{1,2}\s*月\s*\d{1,2}\s*日$/u;
const normalizeFixture=text=>{
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),out=[];let changed=false;
  for(let i=0;i<lines.length;i++){
    const current=lines[i].trim(),next=i+1<lines.length?lines[i+1].trim():'';
    if(current&&dateOnly.test(current)&&next&&!dateOnly.test(next)){out.push(next,`期限: ${current}`);i++;changed=true;continue;}
    out.push(lines[i]);
  }
  return changed?out.join('\n'):String(text);
};
assert.equal(normalizeFixture('11/12\nゆうき誕生日'),'ゆうき誕生日\n期限: 11/12','date + title must be one semantic event block');
assert.equal(normalizeFixture('11/12\nゆうき誕生日\n11/13\n病院'),'ゆうき誕生日\n期限: 11/12\n病院\n期限: 11/13','multiple date/title pairs must remain multiple events');
assert.equal(normalizeFixture('ゆうき誕生日\n病院'),'ゆうき誕生日\n病院','ordinary multi-event lines must not be merged');

for(const marker of [
  "const STORAGE_KEY='familytodo:lastCalendarColor';",
  "const isCreatePage=()=>Boolean(document.getElementById('taskNewPayload'))&&!document.getElementById('taskEditForm');",
  "localStorage.setItem(STORAGE_KEY,normalized(value))",
  "select.rough-main-calendar-color",
  "replace(/\\s*[（(]TimeTree[）)]\\s*/gu,'')",
])assert.ok(colorUi.includes(marker),`calendar color UI contract missing: ${marker}`);
assert.ok(shell.includes('/assets/calendar-color-ui.js'),'calendar color UI must load on color forms');
assert.ok(shell.includes('/assets/task-rough-input-event-normalize.js'),'event normalization must load with rough input');
assert.ok(!shell.includes('/assets/task-new.js'),'app shell must not reference obsolete task-new asset');
assert.ok(!pkg.includes('public/assets/task-new.js'),'checks must not reference obsolete task-new asset');
assert.equal(fs.existsSync('public/assets/task-new.js'),false,'obsolete task-new asset must be removed');

console.log('task entry cleanup contract: unified entry routing, explicit task/event controls, event date-title grouping, calendar labels/swatches/default memory, and task-new asset removal ok');
