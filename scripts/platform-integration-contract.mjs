import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/app.ts');
const index=read('src/index.ts');
const calendar=read('src/google-calendar.ts')+read('src/google-calendar-core.ts');
const calendarJs=read('public/assets/calendar.js');
const familyCss=read('public/assets/family.css');
const taskNew=read('public/assets/task-new.js');
const migration=read('migrations/0042_wave128_calendar_digest_private_event.sql');

for(const token of ['recurrence_rule_id','recurrence_occurrence_id','occurrence_date'])assert.ok(app.includes(token)&&calendarJs.includes(token),token);
assert.ok(calendarJs.includes("new URLSearchParams({edit:")&&!calendarJs.includes("href=\"/task/view.php?id='+encodeURIComponent(t.id)+'\""),'recurring Calendar rows must resolve through recurrence editing');
for(const token of ["view==='family'","view==='assigned'","view==='private'","taskVisibilitySql('t')"])assert.ok(app.includes(token),token);
assert.ok(taskNew.includes('if(isPrivate)isPrivate.disabled=false'),'PRIVATE task control must remain editable');
assert.ok(calendar.includes("visibility_scope='FAMILY'")&&calendar.includes("task_kind='EVENT'")&&calendar.includes('event_history')&&calendar.includes("upper(COALESCE(task_kind,'TASK'))='EVENT'"),'Google projection must remain EVENT/FAMILY aware');
assert.ok(calendar.includes("source:'GOOGLE_CALENDAR'")&&calendar.includes("String(task.task_kind||'TASK').toUpperCase()==='EVENT'")&&calendar.includes('calendar_visible=0'),'Google inbound must preserve EVENT and hidden-calendar semantics');
assert.ok(calendar.includes("ON CONFLICT(provider,task_id)")&&calendar.includes("link?'UPDATE':'CREATE'"),'projection links must remain upsert-aware');
for(const token of ['text-overflow:clip','-webkit-line-clamp:2','repeat(4'])assert.ok(familyCss.includes(token),token);
assert.ok(!app.includes('その他のタイマー'),'obsolete timer section must remain removed');
assert.ok(index.includes("const channel='WEB_PUSH'")&&!index.slice(index.indexOf('async function processNotifications'),index.indexOf('async function taskDelete')).includes('pushLineMessage'),'scheduled notification processor must remain WEB_PUSH-only in this path');
for(const token of ['UNIQUE(family_id,member_id,local_date)','line_daily_digest_receipts','line_daily_digest_recipients'])assert.ok(migration.includes(token),token);
assert.ok(index.includes("visibility_scope='PRIVATE' AND private_owner_id=?")&&index.includes('current>target+9'),'PRIVATE digest filtering and target-time guard must remain intact');
for(const token of ['active channel count','fallback polling active','DB_SCHEMA_MIGRATION_REQUIRED'])assert.ok((calendar+index).includes(token),token);

console.log('platform-integration-contract: Calendar recurrence, visibility, digest, notification and projection contracts ok');
