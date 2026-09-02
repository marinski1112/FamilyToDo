import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const daily=fs.readFileSync('src/daily-task-page.ts','utf8');
const projection=fs.readFileSync('src/recurrence-projection.ts','utf8');

const expiredStart=daily.indexOf('async function expiredTasksFor(ctx:AppContext):Promise<Row[]>');
const expiredEnd=daily.indexOf('async function makeDailyData(ctx:AppContext,date:string)',expiredStart);
if(expiredStart<0||expiredEnd<=expiredStart)throw new Error('daily expired task query boundary missing');
const expired=daily.slice(expiredStart,expiredEnd);
if(!expired.includes("(t.task_kind IS NULL OR lower(t.task_kind)='task')"))throw new Error('expired task query must exclude canonical RECURRING templates');
if(expired.includes('recurrence_occurrences'))throw new Error('recurrence occurrences must never be queried as expired physical tasks');

const canonicalRecurringCreates=(app.match(/calendarColor,'RECURRING',null\)\.run\(\)/g)||[]).length;
if(canonicalRecurringCreates<2)throw new Error('canonical recurring task creation must persist task_kind=RECURRING');
for(const marker of [
  "INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ".bind(fid,Number(rule.id),date,'pending',now,now)",
  "status:isCompleted?'completed':'pending'",
  "return out;",
])if(!projection.includes(marker))throw new Error(`recurrence projection invariant marker missing: ${marker}`);
if(/status\s*:\s*['\"](?:expired|overdue)['\"]/i.test(projection)||/['\"](?:expired|overdue)['\"]/.test(projection))throw new Error('recurrence projection must not synthesize expired/overdue status');

const viewStart=daily.indexOf('async function makeDailyData(ctx:AppContext,date:string)');
const viewEnd=daily.indexOf('async function unorganizedTasksFor',viewStart);
if(viewStart<0||viewEnd<=viewStart)throw new Error('daily view data boundary missing');
const view=daily.slice(viewStart,viewEnd);
if(!view.includes('tasks:[...tasks.results,...recurring]'))throw new Error('recurrence occurrences must remain in normal daily task projection');
if(!view.includes('expiredTasksFor(ctx)'))throw new Error('expired physical tasks must remain a separate daily collection');
console.log('recurrence overdue invariant: canonical templates and occurrences remain outside expired-task classification');
