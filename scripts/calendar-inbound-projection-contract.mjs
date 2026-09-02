import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendarEntry=fs.readFileSync('src/google-calendar.ts','utf8');
const calendarCore=fs.readFileSync('src/google-calendar-core.ts','utf8');
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const calendar=calendarEntry+calendarCore;

for(const marker of [
  'familyTodoTaskId',
  'external_event_id',
  'external_etag',
  "visibility_scope||'FAMILY'",
  "effectiveDelete=op==='DELETE'||!task||!eligibleTask(task)",
  "ON CONFLICT(provider,task_id)",
]) assert.ok(calendar.includes(marker),marker);

assert.ok(oneWay.includes('received: 0'),'manual normal Calendar sync must remain outbound-only');
assert.ok(oneWay.includes('inbound_more: false'),'manual response compatibility must report no inbound continuation');
for(const forbidden of [
  'UPDATE tasks SET title=',
  "1,'EVENT'",
  "event.status==='cancelled'",
  'calendar_visible=0',
  'syncLeases',
  'inboundEventTimes',
  'applyInbound',
  'processCalendarInbound',
  'syncCalendarAccount',
]) assert.ok(!calendar.includes(forbidden),`normal Calendar must not mutate local tasks from Google: ${forbidden}`);

console.log('calendar-inbound-projection-contract: outbound projection identity remains while normal Google-to-FamilyToDo mutation stays absent');
