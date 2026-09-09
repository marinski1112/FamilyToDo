import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendarEntry=fs.readFileSync('src/google-calendar.ts','utf8');
const calendarCore=fs.readFileSync('src/google-calendar-core.ts','utf8');
const calendar=calendarEntry+calendarCore;
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const calendarImport=fs.readFileSync('src/calendar-ics-import.ts','utf8');

for(const marker of [
  'calendar.app.created',
  "visibility_scope='FAMILY'",
  "status='REVOKED'",
  'plusDay',
  'familyTodoTaskId',
  'processCalendarOutbox',
  'createCalendarWatch',
  'renewCalendarWatches',
  'stopFamilyCalendarWatches',
  'wakeCalendarOutbox',
]) assert.ok(calendar.includes(marker),marker);

assert.ok((calendar.match(/refresh_token_ciphertext/g)||[]).length>=2,'encrypted refresh token flow must remain present');
assert.ok(apiRoutes.includes("'/api/google-calendar/sync'"),'/api/google-calendar/sync');
assert.ok(apiRoutes.includes('calendarSyncOutboundOnly(request,context)'),'existing manual Calendar sync must preserve the app-owned outbound adapter until a separate inbound adapter is wired');
assert.ok(publicRoutes.includes('calendarWatchNotificationOnly(request,env)'),'existing app-owned Calendar watch must remain notification-only and must not mutate local tasks');
assert.ok(oneWay.includes('processCalendarOutbox(ctx.env, OUTBOX_LIMIT, familyId)'),'manual sync must preserve outbound projection');
assert.ok(oneWay.includes('received: 0'),'existing outbound adapter must not claim that inbound records were imported');
assert.ok(oneWay.includes("inbound_stage: 'AUTHORIZATION'"),'manual sync must expose a privacy-safe inbound stage while inbound authorization is unavailable');
assert.ok(oneWay.includes("inbound_reason: 'APP_CREATED_SCOPE_ONLY'"),'manual sync must expose the current app-created-only authorization blocker without leaking tokens or calendar data');
assert.ok(oneWay.includes('inbound_more: false'),'existing outbound adapter must preserve inbound_more compatibility as false');
assert.ok(oneWay.includes("UPDATE external_calendar_watch_channels SET last_notification_at=?"),'watch notification health timestamp must remain present');
assert.ok(index.includes('processCalendarOutbox(env)'),'scheduled outbound Calendar projection must remain present');
assert.ok(index.includes('renewCalendarWatches(env)'),'calendar watch renewal must remain present');

// The user now explicitly expects Google Calendar -> FamilyToDo import. This contract must
// protect the existing app-owned outbound lane without categorically forbidding a separate,
// explicit, preview-first inbound implementation. The safe local import primitives must stay
// available so a future Google adapter can normalize into them rather than destructively
// reconciling the app-owned projection state.
for(const marker of [
  'calendarImportPreview',
  'calendarImportPrepare',
  'calendarImportApply',
  "source_format='ICS'",
  "visibility_scope='FAMILY'",
]) assert.ok(calendarImport.includes(marker),`safe calendar-import primitive missing: ${marker}`);
assert.ok(apiRoutes.includes("'/api/calendar-import/preview'"),'calendar import preview route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/prepare'"),'calendar import prepare route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/apply'"),'calendar import apply route must remain available');
assert.ok(calendarImport.includes("String(b.csrf||'')!==String(ctx.session.csrfToken||'')"),'calendar import must retain CSRF protection');
assert.ok(calendarImport.includes("['OWNER','ADMIN']"),'calendar import must remain OWNER/ADMIN scoped');

console.log('google-calendar-inbound-contract: app-owned outbound lane is protected; independent preview-first inbound implementation is no longer categorically blocked');
