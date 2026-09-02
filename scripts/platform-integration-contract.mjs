import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const app=retainedAppContractSource();
const index=read('src/index.ts');
const notificationDelivery=read('src/notification-delivery.ts');
const digest=read('src/line-daily-digest.ts');
const calendar=read('src/google-calendar.ts')+read('src/google-calendar-core.ts');
const oneWay=read('src/google-calendar-one-way.ts');
const publicRoutes=read('src/public-routes.ts');
const contextRoutes=read('src/context-api-routes.ts');
const calendarJs=read('public/assets/calendar.js');
const familyCss=read('public/assets/family.css');
const taskNew=read('public/assets/task-new.js');
const migration=read('migrations/0042_wave128_calendar_digest_private_event.sql');

for(const token of ['recurrence_rule_id','recurrence_occurrence_id','occurrence_date'])assert.ok(app.includes(token)&&calendarJs.includes(token),token);
assert.ok(calendarJs.includes("new URLSearchParams({edit:")&&!calendarJs.includes("href=\"/task/view.php?id='+encodeURIComponent(t.id)+'\""),'recurring Calendar rows must resolve through recurrence editing');
for(const token of ["view==='family'","view==='assigned'","view==='private'","taskVisibilitySql('t')"])assert.ok(app.includes(token),token);
assert.ok(taskNew.includes('if(isPrivate)isPrivate.disabled=false'),'PRIVATE task control must remain editable');
assert.ok(calendar.includes("visibility_scope='FAMILY'")&&calendar.includes("task_kind='EVENT'")&&calendar.includes('event_history')&&calendar.includes("upper(COALESCE(task_kind,'TASK'))='EVENT'"),'Google outbound projection must remain EVENT/FAMILY aware');
assert.ok(calendar.includes("ON CONFLICT(provider,task_id)")&&calendar.includes("link?'UPDATE':'CREATE'"),'projection links must remain upsert-aware');
assert.ok(calendar.includes('familyTodoTaskId'),'Google outbound projection identity must remain attached');
assert.ok(oneWay.includes('received: 0')&&oneWay.includes('inbound_more: false'),'normal Calendar API compatibility must report no inbound work');
assert.ok(contextRoutes.includes('calendarSyncOutboundOnly(request,context)'),'normal Calendar manual sync must remain outbound-only');
assert.ok(publicRoutes.includes('calendarWatchNotificationOnly(request,env)'),'normal Calendar watch must remain notification-only');
for(const retired of ['processCalendarInbound','calendarSyncNow','calendarWatchWebhook','applyInbound','inboundEventTimes','syncCalendarAccount'])assert.ok(!calendar.includes(retired),`normal Google inbound must stay removed: ${retired}`);
for(const token of ['text-overflow:clip','-webkit-line-clamp:2','repeat(4'])assert.ok(familyCss.includes(token),token);
assert.ok(!app.includes('その他のタイマー'),'obsolete timer section must remain removed');
assert.ok(notificationDelivery.includes("const channel='WEB_PUSH'")&&!notificationDelivery.includes('pushLineMessage'),'scheduled notification processor must remain WEB_PUSH-only in this path');
for(const token of ['UNIQUE(family_id,member_id,local_date)','line_daily_digest_receipts','line_daily_digest_recipients'])assert.ok(migration.includes(token),token);
assert.ok(digest.includes("visibility_scope='PRIVATE' AND private_owner_id=?")&&digest.includes('current>target+29'),'PRIVATE digest filtering and 30-minute target-time guard must remain intact');
for(const token of ['active channel count','DB_SCHEMA_MIGRATION_REQUIRED'])assert.ok((calendar+index).includes(token),token);
assert.ok(!calendar.includes('fallback polling active'),'retired normal inbound polling copy must stay removed');

console.log('platform-integration-contract: Calendar recurrence, visibility, digest, notification and one-way projection contracts ok');
