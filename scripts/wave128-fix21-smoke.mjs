import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const google=fs.readFileSync('src/google-calendar.ts','utf8');
const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const ics=fs.readFileSync('src/calendar-ics-import.ts','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});

assert.ok(google.includes("action === 'preview_event_reset'"),'EVENT reset must have a preview action');
assert.ok(google.includes("action === 'reset_event_data'"),'EVENT reset must have an apply action');
assert.ok(google.includes("RESET_ALL_EVENTS"),'EVENT reset must require an explicit confirmation token');
assert.ok(google.includes("dependency_count > 0"),'EVENT reset must block when task-linked dependencies exist');
assert.ok(google.includes("calendar_import_entries SET status='ROLLED_BACK',task_id=NULL,recurrence_rule_id=NULL"),'EVENT reset must make ICS identities re-importable');
assert.ok(google.includes("DELETE FROM recurrence_occurrences"),'EVENT reset must remove linked recurrence occurrence state');
assert.ok(google.includes("DELETE FROM recurrence_rules"),'EVENT reset must remove linked recurrence rules');
assert.ok(google.includes("hintedInboundAlreadyProjected"),'Google inbound must guard duplicate events that point at an already-projected Family TODO task');
assert.ok(google.includes("if (await hintedInboundAlreadyProjected(env, account, event)) return 0"),'duplicate hinted Google events must not create another local EVENT');
assert.ok(google.includes("id=\"calendarEventReset\""),'integration settings must expose the EVENT reset control');
assert.ok(ics.includes("calendar_visible,calendar_color,task_kind")&&ics.includes("e.allDay?1:0,e.color"),'ICS COLOR must continue to map into tasks.calendar_color');
assert.ok(ics.includes("source_uid")&&ics.includes("eventKey"),'ICS UID identity tracking must remain enabled');
assert.ok(ui.includes('bandsForCell')&&ui.includes('singleSlots'),'Calendar row cap must count spanning bands and ordinary rows together');
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO static namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire older Family TODO static caches');

console.log('wave128 fix21 smoke: EVENT reset, ICS color/UID preservation, Google duplicate guard, and mixed Calendar cap ok');
