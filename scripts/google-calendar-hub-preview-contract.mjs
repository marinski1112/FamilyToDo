import assert from 'node:assert/strict';
import fs from 'node:fs';

const safety=fs.readFileSync('src/google-calendar-inbound-safety.ts','utf8');
const preview=fs.readFileSync('src/google-calendar-inbound-preview.ts','utf8');
const core=fs.readFileSync('src/google-calendar-core.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

const gateStart=safety.indexOf('export function googleCalendarInboundCalendarBlockReason');
const classifierStart=safety.indexOf('export function classifyGoogleCalendarInboundEvent');
assert.ok(gateStart>=0&&classifierStart>gateStart,'calendar source gate and event classifier must exist');
const gate=safety.slice(gateStart,classifierStart);
assert.ok(!gate.includes("return 'APP_OWNED_CALENDAR_BLOCKED'"),'Family TODO app-owned calendar must be selectable as the shared Google Home hub');
assert.ok(gate.includes("return 'CHILD_JOURNAL_CALENDAR_BLOCKED'"),'CHILD_JOURNAL must remain isolated from normal inbound Calendar import');
assert.ok(gate.includes('_appOwnedCalendarId'),'app-owned calendar identity must remain an explicit, intentionally non-blocking input');

const classifier=safety.slice(classifierStart);
const marker=classifier.indexOf('privateProps.familyTodoTaskId');
const outboundEvidence=classifier.indexOf('evidence.outboundLinked');
const newCandidate=classifier.indexOf("return 'NEW_CANDIDATE'");
assert.ok(marker>=0&&outboundEvidence>marker&&newCandidate>outboundEvidence,'self-generated marker and outbound event-id evidence must be evaluated before NEW_CANDIDATE');
assert.ok(core.includes('extendedProperties:{private:{familyTodoTaskId:String(t.id)}}'),'every FamilyToDo Calendar projection must carry the self-origin marker');
assert.ok(preview.includes("external_event_id value FROM external_calendar_links WHERE family_id=? AND provider=? AND calendar_id=?"),'preview must retain outbound event-id evidence scoped to family/provider/calendar');
assert.ok(preview.includes('blocked_reason:googleCalendarInboundCalendarBlockReason(id,protectedIds.appOwned,protectedIds.childJournal)'),'calendar discovery must use the shared gate so Family TODO becomes selectable while CHILD_JOURNAL stays blocked');
assert.ok(preview.includes('googleCalendarInboundCalendarBlockReason(calendarId,protectedIds.appOwned,protectedIds.childJournal)'),'preview must re-check the selected calendar server-side');
assert.ok(!apiRoutes.includes("'/api/google-calendar/inbound-apply'"),'hub-preview change must not introduce apply/task mutation');

console.log('google-calendar-hub-preview-contract: Family TODO is a selectable hub and self-generated events remain fail-closed before NEW_CANDIDATE');
