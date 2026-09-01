import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const source=(path)=>readFileSync(new URL(path,root),'utf8');
const temp=mkdtempSync(join(tmpdir(),'familytodo-range-'));
try{
  const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','src/task-range-safety.ts','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--strict','--skipLibCheck','--outDir',temp],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(compile.status,0,`range helper compile failed:\n${compile.stdout}\n${compile.stderr}`);
  const range=await import(pathToFileURL(join(temp,'task-range-safety.js')).href+`?v=${Date.now()}`);

  assert.equal(range.isValidDateOnly('2026-08-31'),true);
  assert.equal(range.isValidDateOnly('2026-02-31'),false,'nonexistent dates must be rejected');
  assert.equal(range.isValidTimeOnly('23:59'),true);
  assert.equal(range.isValidTimeOnly('24:00'),false,'invalid times must be rejected');

  assert.deepEqual(range.safeCalendarDateRange('2026-08-20','2026-08-19'),{
    start:'2026-08-20',end:'2026-08-20',startMs:1787227200000,endMs:1787227200000,spanDays:1,
  },'reversed persisted ranges must fall back to one finite day');
  assert.equal(range.safeCalendarDateRange('2026-08-20','not-a-date')?.spanDays,1,'malformed end must fall back to one finite day');
  assert.equal(range.safeCalendarDateRange('not-a-date','2026-08-20'),null,'malformed start is not renderable');
  assert.equal(range.safeCalendarDateRange('2026-08-20','2026-08-22')?.spanDays,3,'valid multi-day ranges must remain multi-day');

  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:true,startDate:'2026-08-20',endDate:'2026-08-19'}),{ok:false,error:'DATE_ORDER'});
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:true,startDate:'2026-02-31',endDate:'2026-02-31'}),{ok:false,error:'START_DATE_INVALID'});
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:true,startDate:'2026-08-20',endDate:'2026-08-22'}),{ok:true,startAt:'2026-08-20 00:00:00',endAt:'2026-08-22 23:59:59'});
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-20',startTime:'18:00',endTime:'17:00',requireTimedStart:true}),{ok:false,error:'TIME_ORDER'});
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-21',startTime:'23:00',endTime:'01:00',requireTimedStart:true}),{ok:true,startAt:'2026-08-20 23:00:00',endAt:'2026-08-21 01:00:00'});
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-20',startTime:'2026-08-20T18:00',endTime:'2026-08-20T19:00',requireTimedStart:true}),{ok:true,startAt:'2026-08-20 18:00:00',endAt:'2026-08-20 19:00:00'},'legacy local datetime API syntax must remain accepted when it matches the authoritative date fields');
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-20',startTime:'2026-08-21T18:00',endTime:'19:00',requireTimedStart:true}),{ok:false,error:'START_TIME_INVALID'},'embedded start date must not override the authoritative start date');
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-21',startTime:'2026-08-20T23:00',endTime:'2026-08-21T01:00',requireTimedStart:true}),{ok:true,startAt:'2026-08-20 23:00:00',endAt:'2026-08-21 01:00:00'},'legacy local datetime syntax must preserve valid overnight ranges');
  assert.deepEqual(range.buildStoredTaskRange({noDate:false,allDay:false,startDate:'2026-08-20',endDate:'2026-08-21',startTime:'23:00',endTime:'2026-08-22T01:00',requireTimedStart:true}),{ok:false,error:'END_TIME_INVALID'},'embedded end date must not override the authoritative end date');

  const app=source('src/app.ts');
  const index=source('src/index.ts');
  const taskNew=source('public/assets/task-new.js');
  const taskEdit=source('public/assets/task-edit.js');
  assert.match(app,/safeCalendarDateRange/,'Calendar renderer must use the finite range helper');
  assert.doesNotMatch(app,/if\(last<d\)last=d/,'mutable Date alias fallback must not return');
  assert.match(index,/buildStoredTaskRange/,'task create API must use authoritative range validation');
  assert.match(app,/buildStoredTaskRange/,'task edit/create-adjacent server writes must use authoritative range validation');
  assert.match(taskNew,/validateTaskRange/,'task create UI should reject reversed input before the API call');
  assert.match(taskEdit,/validateTaskRange/,'task edit UI should reject reversed input before the API call');
  assert.match(app,/task_range/,'settings diagnostics must expose aggregate task-range inspection');
  assert.match(app,/repair_unambiguous_task_ranges/,'narrow repair path must be explicit');
  assert.match(app,/substr\(start_at,1,10\)=substr\(end_at,1,10\)/,'automatic repair must be limited to same-day unambiguous all-day rows');
  assert.ok(app.includes("date(substr(start_at,1,10), '+0 days')=substr(start_at,1,10)"),'task-range diagnostics and repair must round-trip persisted start calendar dates');
  assert.ok(app.includes("date(substr(end_at,1,10), '+0 days')=substr(end_at,1,10)"),'task-range diagnostics and repair must round-trip persisted end calendar dates');
  assert.ok(app.includes("date(substr(start_at,1,10), '+0 days')<>substr(start_at,1,10)"),'impossible persisted start dates must count as diagnostic issues');
  assert.ok(app.includes("date(substr(end_at,1,10), '+0 days')<>substr(end_at,1,10)"),'impossible persisted end dates must count as diagnostic issues');
  assert.doesNotMatch(app,/console\.(?:log|error|warn)\([^\n]*(?:start_at|end_at|task_range)/,'range safety must not log persisted dates or row details');

  console.log('calendar-range-safety contract: ok');
}finally{rmSync(temp,{recursive:true,force:true});}
