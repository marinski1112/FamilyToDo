import assert from 'node:assert/strict';
import fs from 'node:fs';

const google=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const ics=fs.readFileSync('src/calendar-ics-import.ts','utf8');

// Explicit, dependency-safe EVENT reset for pre-production recovery.
assert.ok(google.includes("action === 'preview_event_reset'"),'EVENT reset must retain preview');
assert.ok(google.includes("action === 'reset_event_data'"),'EVENT reset must retain apply action');
assert.ok(google.includes('RESET_ALL_EVENTS'),'EVENT reset must require the explicit confirmation token');
assert.ok(google.includes('dependency_count > 0'),'EVENT reset must block when task-linked dependencies exist');
assert.ok(google.includes("calendar_import_entries SET status='ROLLED_BACK',task_id=NULL,recurrence_rule_id=NULL"),'EVENT reset must make ICS identities re-importable');
assert.ok(google.includes('DELETE FROM recurrence_occurrences'),'EVENT reset must remove linked recurrence occurrence state');
assert.ok(google.includes('DELETE FROM recurrence_rules'),'EVENT reset must remove linked recurrence rules');
assert.ok(google.includes('id="calendarEventReset"'),'integration settings must retain the EVENT reset control');

// Import identity and color fidelity must survive recovery/reset independently of Google inbound.
assert.ok(ics.includes('calendar_visible,calendar_color,task_kind')&&ics.includes('e.allDay?1:0,e.color'),'ICS COLOR must continue to map into tasks.calendar_color');
assert.ok(ics.includes('source_uid')&&ics.includes('eventKey'),'ICS UID identity tracking must remain enabled');

for(const retired of ['hintedInboundAlreadyProjected','applyInboundSafely','processCalendarInbound','syncCalendarAccount']) {
  assert.ok(!google.includes(retired),`ICS recovery must not depend on retired normal Google inbound: ${retired}`);
}
assert.ok(google.includes('familyTodoTaskId'),'outbound projection identity hint must remain available for Google events created by FamilyToDo');

console.log('calendar-import-recovery-contract: EVENT reset and ICS identity/color recovery remain intact without normal Google inbound');
