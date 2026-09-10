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
const inboundSafety=fs.readFileSync('src/google-calendar-inbound-safety.ts','utf8');
const inboundIdentityMigration=fs.readFileSync('migrations/0072_google_calendar_inbound_identity.sql','utf8');

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

// Existing ICS import remains an independent, preview-first path. Its UID ledger is useful
// secondary evidence, but it is not a substitute for Google calendarId + event.id identity.
for(const marker of [
  'calendarImportPreview',
  'calendarImportPrepare',
  'calendarImportApply',
  "source_format='ICS'",
]) assert.ok(calendarImport.includes(marker),`safe calendar-import primitive missing: ${marker}`);
assert.ok(calendarImport.includes('visibility_scope,private_owner_id'),'calendar import task insert must explicitly retain visibility ownership columns');
assert.ok(calendarImport.includes("'EVENT',0,'FAMILY',NULL"),'calendar import apply must create FAMILY-visible EVENT rows rather than PRIVATE rows');
assert.ok(apiRoutes.includes("'/api/calendar-import/preview'"),'calendar import preview route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/prepare'"),'calendar import prepare route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/apply'"),'calendar import apply route must remain available');
assert.ok(calendarImport.includes("String(b.csrf||'')!==String(ctx.session.csrfToken||'')"),'calendar import must retain CSRF protection');
assert.ok(calendarImport.includes("['OWNER','ADMIN']"),'calendar import must remain OWNER/ADMIN scoped');

// Before any Google -> FamilyToDo apply path exists, external identity must be independently
// idempotent and must survive account/reconnect details. account_id is nullable provenance so a
// future hard account deletion cannot erase the family + calendarId + event.id dedupe history.
for(const marker of [
  'google_calendar_inbound_links',
  'account_id INTEGER REFERENCES external_calendar_accounts(id) ON DELETE SET NULL',
  'calendar_id TEXT NOT NULL',
  'external_event_id TEXT NOT NULL',
  'ical_uid TEXT',
  'UNIQUE(family_id, calendar_id, external_event_id)',
  'idx_google_calendar_inbound_task',
  'WHERE task_id IS NOT NULL',
]) assert.ok(inboundIdentityMigration.includes(marker),`Google inbound identity guard missing: ${marker}`);
assert.ok(!inboundIdentityMigration.includes('UNIQUE(family_id, ical_uid)'), 'iCalUID must not be the Google primary unique identity because recurring occurrences can share it');
assert.ok(!inboundIdentityMigration.includes('account_id INTEGER NOT NULL'),'account provenance must not force deletion of dedupe identity on account removal');
assert.ok(!inboundIdentityMigration.includes('account_id INTEGER NOT NULL REFERENCES external_calendar_accounts(id) ON DELETE CASCADE'),'account deletion must never cascade-delete inbound dedupe history');

for(const marker of [
  'GOOGLE_CALENDAR_INBOUND_MAX_EVENTS=250',
  'APP_OWNED_CALENDAR_BLOCKED',
  'CHILD_JOURNAL_CALENDAR_BLOCKED',
  'INVALID_EVENT_ID',
  'RECURRING_UNSUPPORTED',
  'APP_OWNED_MARKER',
  'ALREADY_IMPORTED',
  'ALREADY_LINKED_OUTBOUND',
  'ICS_ALREADY_IMPORTED',
  'AMBIGUOUS_EXISTING_LOCAL',
  'NEW_CANDIDATE',
  'familyTodoTaskId',
  'localScanTruncated',
]) assert.ok(inboundSafety.includes(marker),`Google inbound fail-closed classifier missing: ${marker}`);

// This foundation is deliberately incapable of changing FamilyToDo data. Enabling a live
// read-only preview and later apply remain separate reviewed steps.
for(const forbidden of [
  'INSERT INTO tasks',
  'UPDATE tasks',
  'DELETE FROM tasks',
  'INSERT INTO google_calendar_inbound_links',
  'UPDATE google_calendar_inbound_links',
  'DELETE FROM google_calendar_inbound_links',
  'fetch(',
]) assert.ok(!inboundSafety.includes(forbidden),`inbound safety foundation must remain pure/read-only: ${forbidden}`);
assert.ok(!apiRoutes.includes("'/api/google-calendar/inbound-apply'"),'Google inbound apply route must not exist in the dedupe-foundation stage');

console.log('google-calendar-inbound-contract: outbound lane stays isolated; Google inbound identity is DB-idempotent and fail-closed before any live apply path exists');