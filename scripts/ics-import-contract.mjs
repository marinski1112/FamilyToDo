import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-ics-import.ts','utf8');
const routes=fs.readFileSync('src/index.ts','utf8');
const ui=fs.readFileSync('public/assets/calendar-import.js','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const css=fs.readFileSync('public/assets/calendar.css','utf8');
const migration=fs.readFileSync('migrations/0037_wave112_calendar_import_resume_lock.sql','utf8');

// D1 query budget and bounded apply/rollback work.
assert.match(source,/ICS_APPLY_CHUNK=15/,'ICS apply must stay bounded to 15 events per request');
assert.match(source,/ICS_ROLLBACK_CHUNK=(?:15|20)/,'ICS rollback must remain bounded');
assert.match(source,/ICS_MAX_EXDATES=4/,'recurrence exception cost must stay bounded');
assert.match(source,/MAX_D1_QUERY_BUDGET=40/,'ICS import must stay under the D1 query budget');
assert.doesNotMatch(source,/query_budget_max:(?:67|64)/,'legacy oversized query budgets must not return');
assert.ok(source.includes('query_budget_max:MAX_D1_QUERY_BUDGET'),'reported budget must use the active query-budget constant');

const applyCost=e=>2+(e.recurring?1+e.exdates:0);
const pack=(events,reserve=6)=>{let q=reserve,n=0;for(const e of events){const cost=applyCost(e);if(n&&q+cost>40)break;q+=cost;n++;}return {q,n};};
const worst=Array.from({length:10},()=>({recurring:true,exdates:4}));
const first=pack(worst);
assert.equal(first.q,34);assert.equal(first.n,4);assert.ok(first.q<50);
let remaining=634,invocations=0;
while(remaining){const result=pack(Array.from({length:Math.min(remaining,20)},()=>({recurring:false,exdates:0})));assert.ok(result.q<=40);remaining-=result.n;invocations++;}
assert.equal(remaining,0);assert.ok(invocations>0);
const rollbackPack=costs=>{let q=3,n=0;for(const cost of costs){if(n&&q+cost>40)break;q+=cost;n++;}return {q,n};};
const rollback=rollbackPack(Array(10).fill(4));assert.equal(rollback.q,39);assert.equal(rollback.n,9);assert.ok(rollback.q<50);

// Provenance, normalization and rollback identity.
assert.doesNotMatch(source,/source_uid=\? AND source_recurrence_key=\?/,'import lookup must not regress to the per-row two-bind identity query');
assert.match(source,/WHERE family_id=\? AND source_format='ICS'/,'ICS provenance must stay family/source scoped');
for(const token of ['ROLLED_BACK','MISSING','EDITED_KEPT',"status='ACTIVE'",'source_recurrence_key'])assert.ok(source.includes(token),`missing provenance contract: ${token}`);
for(const route of ['/api/calendar-import/preview','/api/calendar-import/normalization-preview','/api/calendar-import/apply','/api/calendar-import/rollback']){assert.ok(routes.includes(route),`missing route ${route}`);assert.ok(routes.includes('return await calendarImport'),`calendar import routing must remain delegated: ${route}`);}
assert.ok(routes.includes('CALENDAR_IMPORT_INTERNAL_ERROR'),'calendar import route must retain stable internal-error mapping');
assert.ok(ui.includes('サーバーエラーが発生しました（HTTP'),'import UI must expose HTTP failures');
for(const token of ['DETERMINISTIC_START','DETERMINISTIC_RANGE','AI_REVIEW_REQUIRED','missing_end_minutes','normalization_token','familyAiProvider'])assert.ok(source.includes(token),`missing normalization contract: ${token}`);
assert.match(source,/end_time:null/,'single-time normalization must allow an absent end time');
assert.match(source,/start<end/,'range normalization must require end after start');
assert.ok(source.includes("if(!e.allDay||e.rrule)continue"),'normalization must remain scoped to eligible all-day non-recurring imports');
assert.match(source,/if\(!duration\)return s\.start_time/,'duration-free titles must keep the parsed start time');
assert.match(source,/cleaned\|\|title/,'normalization must retain a safe title fallback');
assert.ok(ui.includes('終了時刻なし（推奨）'));assert.ok(ui.includes('変更しない'));
assert.ok(ui.includes('raw ICS'));assert.ok(ui.includes('ai_requests'));assert.ok(ui.includes('while(!done)'));

// Chunked browser/server resume protocol.
assert.match(source,/parseIcs\(String\(b\.chunk_ics\|\|''\),zone,true\)/,'server must parse only the submitted chunk');
assert.doesNotMatch(source,/calendarImportApply[\s\S]{0,500}requestState/,'apply must not retain request-global parsed state');
assert.match(source,/parsedCount>ICS_APPLY_CHUNK/);assert.match(source,/sha_count:parsedCount/);assert.match(source,/parsed_event_count:parsedCount/);
assert.match(source,/status='IMPORTING'/);assert.match(source,/requestedOffset!==serverOffset/);assert.match(source,/COUNT\(\*\) active_count/);
assert.match(ui,/splitIcs/);assert.match(ui,/chunk_ics:(?:chunks\[chunkIndex\]|buildChunk)/);assert.doesNotMatch(ui,/calendar-import\/apply',\{\.\.\.args\(\)/);
assert.match(ui,/インポート準備中/);assert.match(ui,/処理が中断されました。再開できます/);assert.match(routes,/calendar-import\/prepare/);assert.match(routes,/calendar-import\/status/);
remaining=634;let requests=0;
while(remaining){const parsed=Math.min(15,remaining);assert.ok(parsed<=15);remaining-=parsed;requests++;}
assert.equal(requests,43);assert.equal(remaining,0);
const event='BEGIN:VEVENT\r\nUID:x\r\nDTSTART:20260828T140000\r\nSUMMARY:'+('予定'.repeat(45))+'\r\nEND:VEVENT\r\n';
const fixture='BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+Array.from({length:634},(_,i)=>event.replace('UID:x',`UID:${i}`)).join('')+'END:VCALENDAR\r\n';
assert.equal((fixture.match(/BEGIN:VEVENT/g)||[]).length,634);assert.ok(Buffer.byteLength(fixture)>100000);assert.ok(Buffer.byteLength(event.repeat(15))<Buffer.byteLength(fixture)/10);

// Exact ordinal resume, lease/CAS protection and one-active-file invariant.
assert.match(ui,/file\.click\(\)/);assert.doesNotMatch(ui,/file\.focus\(/);assert.match(ui,/if\(applyRunning\)return/);assert.match(ui,/前回と同じICSファイルを選択してください/);
assert.match(ui,/function buildChunk\(parts,start/);assert.match(ui,/parts\.events\.slice\(start,start\+max\)/);assert.doesNotMatch(ui,/Math\.floor\(offset/);
const ids=Array.from({length:634},(_,i)=>i);
for(const offset of [0,1,14,15,16,17,29,30,31,633,634]){const seen=new Set(ids.slice(0,offset));let cursor=offset;while(cursor<634){const part=ids.slice(cursor,cursor+15);assert.ok(part.length<=15);for(const id of part){assert.ok(!seen.has(id));seen.add(id);}cursor+=part.length;}assert.equal(cursor,634);assert.equal(seen.size,634);for(const id of ids)assert.ok(seen.has(id));}
assert.match(source,/lease_expires_at<\?/);assert.match(source,/processed_count=\? AND \(lease_token IS NULL/);assert.match(source,/code:'IMPORT_BUSY'/);assert.match(source,/processed_count=\? AND lease_token=\?/);assert.match(source,/ICS_APPLY_LEASE_MS=25_000/);
assert.match(migration,/UPDATE calendar_import_batches AS duplicate/);assert.match(migration,/CREATE UNIQUE INDEX idx_calendar_import_one_active_file/);assert.match(source,/INSERT OR IGNORE INTO calendar_import_batches/);assert.match(source,/resume_batch_id/);

// Imported schedule labels must remain readable after normalization.
for(const token of ['calendarDisplayLabel','calendar-item-time','a===r.start','aria-label'])assert.ok(app.includes(token)||css.includes(token),`missing Calendar display contract: ${token}`);
assert.match(app,/display\.time\?display\.time\+' ':''}\$\{icon/);assert.match(app,/same&&.*===time/);

console.log('ics-import-contract: budget, normalization, chunking, resume, provenance, and display contracts ok');
