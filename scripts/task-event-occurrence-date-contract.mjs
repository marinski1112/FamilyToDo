import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const ics=fs.readFileSync(new URL('../src/calendar-ics-import.ts',import.meta.url),'utf8');

// Reference semantics for the daily Task/Event list. Events are occurrences, not overdue work:
// they are visible only while the selected date intersects their own date range. Tasks retain
// the existing carry-over behavior when start_at exists and end_at is absent.
const day=(value)=>value?String(value).slice(0,10):'';
function visibleOn(row,date){
  const kind=String(row.task_kind||'').toLowerCase();
  const start=day(row.start_at);
  const due=day(row.due_at);
  const end=day(row.end_at);
  if(kind==='event'){
    if(start)return start<=date && (end||start)>=date;
    return Boolean(due)&&due===date;
  }
  if(start)return start<=date && (!end||end>=date);
  return Boolean(due)&&due===date;
}

assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-29 10:00:00',end_at:null},'2026-09-01'),false,'past single-day manual event must not carry forward');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-09-01 10:00:00',end_at:null},'2026-09-01'),true,'today event must be visible');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-31 10:00:00',end_at:'2026-09-02 18:00:00'},'2026-09-01'),true,'active multi-day event must remain visible');
assert.equal(visibleOn({task_kind:'EVENT',start_at:'2026-08-31 10:00:00',end_at:'2026-09-01 09:00:00'},'2026-09-02'),false,'timed event must disappear after its end date');
assert.equal(visibleOn({task_kind:'task',start_at:'2026-08-29 10:00:00',end_at:null},'2026-09-01'),true,'unfinished task carry-over semantics must remain intact');

const makeViewStart=app.indexOf('async function makeViewData');
const makeViewEnd=app.indexOf('\nexport async function today',makeViewStart);
assert.ok(makeViewStart>=0&&makeViewEnd>makeViewStart,'makeViewData must remain present');
const daily=app.slice(makeViewStart,makeViewEnd);
assert.match(daily,/lower\(COALESCE\(t\.task_kind,''\)\)='event'/,'daily query must explicitly separate event semantics');
assert.match(daily,/date\(COALESCE\(t\.end_at,t\.start_at\)\)>=date\(\?\)/,'event without end_at must fall back to its start date, not become open-ended');
assert.match(daily,/lower\(COALESCE\(t\.task_kind,''\)\)<>'event'/,'non-event task semantics must remain a separate branch');
assert.match(daily,/t\.end_at IS NULL OR date\(t\.end_at\)>=date\(\?\)/,'task carry-over behavior must be preserved');
assert.match(daily,/recurringForDate\(ctx,date\)/,'recurring rows must continue to be projected for the selected date only');
assert.doesNotMatch(daily,/task_kind.*event.*status='completed'/is,'event visibility must not depend on completion state');

const expiredStart=app.indexOf('async function expiredTasksFor');
const expiredEnd=app.indexOf('\nasync function makeViewData',expiredStart);
assert.ok(expiredStart>=0&&expiredEnd>expiredStart,'expired task query must remain present');
const expired=app.slice(expiredStart,expiredEnd);
assert.match(expired,/lower\(t\.task_kind\)='task'/,'overdue section must remain task-only');
assert.match(expired,/t\.status='pending'/,'overdue pending-task path must remain active');

// Imported ICS events already persist an explicit normalized end_at. Keep that representation
// intact while applying the same event date-intersection semantics in the daily list.
assert.match(ics,/e\.startAt,e\.endAt/,'ICS import must continue to persist both normalized event boundaries');
assert.match(ics,/'EVENT'/,'ICS import must continue to classify imported rows as events');

// Recurrence projection itself must be range-scoped so a prior occurrence cannot be carried into D.
const recurringForDateStart=app.indexOf('async function recurringForDate');
const recurringForDateEnd=app.indexOf('\n\nasync function expiredTasksFor',recurringForDateStart);
const recurringForDate=app.slice(recurringForDateStart,recurringForDateEnd);
assert.match(recurringForDate,/recurringForRange\(ctx,date,date\)/,'recurring event/task projection must remain target-date scoped');

console.log('Task/Event occurrence-date contract passed');
