import fs from 'node:fs';
import assert from 'node:assert/strict';

const dailySource=fs.readFileSync(new URL('../src/daily-task-page.ts',import.meta.url),'utf8');
const recurrence=fs.readFileSync(new URL('../src/recurrence-projection.ts',import.meta.url),'utf8');
const ics=fs.readFileSync(new URL('../src/calendar-ics-import.ts',import.meta.url),'utf8');

const day=(value)=>value?String(value).slice(0,10):'';
function visibleOn(row,date){
  const kind=String(row.task_kind||'').toLowerCase();
  const start=day(row.start_at);const due=day(row.due_at);const end=day(row.end_at);
  if(kind==='event'){if(start)return start<=date&&(end||start)>=date;return Boolean(due)&&due===date;}
  if(start)return start<=date&&(end||due||start)>=date;return Boolean(due)&&due===date;
}
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-29 10:00:00',end_at:null},'2026-09-01'),false,'past single-day manual event must not carry forward');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-09-01 10:00:00',end_at:null},'2026-09-01'),true,'today event must be visible');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-31 10:00:00',end_at:'2026-09-02 18:00:00'},'2026-09-01'),true,'active multi-day event must remain visible');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-31 10:00:00',end_at:'2026-09-01 09:00:00'},'2026-09-02'),false,'timed event must disappear after its end date');
assert.equal(visibleOn({task_kind:'task',start_at:'2026-08-29 10:00:00',due_at:'2026-08-31 23:59:00',end_at:null},'2026-09-01'),false,'task must leave the normal list after its retained effective deadline');
assert.equal(visibleOn({task_kind:'task',start_at:'2026-08-29 10:00:00',due_at:'2026-09-02 23:59:00',end_at:null},'2026-09-01'),true,'task must remain visible through its due date when no explicit end exists');
assert.equal(visibleOn({task_kind:'task',start_at:'2026-09-01 10:00:00',due_at:null,end_at:null},'2026-09-02'),false,'start-only task must use its start date as the same fallback deadline used by expired classification');

const makeViewStart=dailySource.indexOf('async function makeDailyData');
const makeViewEnd=dailySource.indexOf('\nasync function unorganizedTasksFor',makeViewStart);
assert.ok(makeViewStart>=0&&makeViewEnd>makeViewStart,'makeDailyData must remain present');
const daily=dailySource.slice(makeViewStart,makeViewEnd);
assert.match(daily,/lower\(COALESCE\(t\.task_kind,''\)\)='event'/,'daily query must explicitly separate event semantics');
assert.match(daily,/date\(COALESCE\(t\.end_at,t\.start_at\)\)>=date\(\?\)/,'event without end_at must fall back to its start date, not become open-ended');
assert.match(daily,/lower\(COALESCE\(t\.task_kind,''\)\)<>'event'/,'non-event task semantics must remain a separate branch');
assert.match(daily,/date\(COALESCE\(t\.end_at,t\.due_at,t\.start_at\)\)>=date\(\?\)/,'normal task window must use the same end_at -> due_at -> start_at effective deadline as expired classification');
assert.match(daily,/recurringForDate\(ctx,date\)/,'recurring rows must continue to be projected for the selected date only');
assert.doesNotMatch(daily,/task_kind.*event.*status='completed'/is,'event visibility must not depend on completion state');

const expiredStart=dailySource.indexOf('async function expiredTasksFor');
const expiredEnd=dailySource.indexOf('\nasync function makeDailyData',expiredStart);
assert.ok(expiredStart>=0&&expiredEnd>expiredStart,'expired task query must remain present');
const expired=dailySource.slice(expiredStart,expiredEnd);
assert.match(expired,/lower\(t\.task_kind\)='task'/,'overdue section must remain task-only');
assert.match(expired,/t\.status='pending'/,'overdue pending-task path must remain active');
assert.match(expired,/date\(COALESCE\(t\.end_at,t\.due_at,t\.start_at\)\) < date\(\?\)/,'expired classification must keep the same effective deadline order as the normal task window');

assert.match(ics,/e\.startAt,e\.endAt/,'ICS import must continue to persist both normalized event boundaries');
assert.match(ics,/'EVENT'/,'ICS import must continue to classify imported rows as events');
assert.match(recurrence,/export async function recurringForDate\(ctx:AppContext,date:string\):Promise<Row\[]>\{return recurringForRange\(ctx,date,date\);\}/,'recurring event/task projection must remain target-date scoped');
console.log('Task/Event occurrence-date contract passed');
