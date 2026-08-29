import assert from 'node:assert/strict';
import fs from 'node:fs';

const google=fs.readFileSync('src/google-calendar.ts','utf8');
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

// Import identity and color fidelity must survive recovery/reset.
assert.ok(ics.includes('calendar_visible,calendar_color,task_kind')&&ics.includes('e.allDay?1:0,e.color'),'ICS COLOR must continue to map into tasks.calendar_color');
assert.ok(ics.includes('source_uid')&&ics.includes('eventKey'),'ICS UID identity tracking must remain enabled');

// The inbound duplicate guard is part of reset/re-import safety.
assert.ok(google.includes('hintedInboundAlreadyProjected'),'Google inbound must guard already-projected hinted tasks');
assert.ok(google.includes('if (await hintedInboundAlreadyProjected(env, account, event)) return 0'),'duplicate hinted Google events must not create another local EVENT');

console.log('calendar-import-recovery-contract: EVENT reset, ICS identity/color, and duplicate guard ok');
