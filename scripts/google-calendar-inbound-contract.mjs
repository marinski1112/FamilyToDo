import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendarEntry=fs.readFileSync('src/google-calendar.ts','utf8');
const calendarCore=fs.readFileSync('src/google-calendar-core.ts','utf8');
const calendar=calendarEntry+calendarCore;
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
const calendarImport=fs.readFileSync('src/calendar-ics-import.ts','utf8');
const inboundSafety=fs.readFileSync('src/google-calendar-inbound-safety.ts','utf8');
const inboundAuth=fs.readFileSync('src/google-calendar-inbound-auth.ts','utf8');
const inboundIdentityMigration=fs.readFileSync('migrations/0072_google_calendar_inbound_identity.sql','utf8');
const inboundAuthMigration=fs.readFileSync('migrations/0073_google_calendar_inbound_authorization.sql','utf8');

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
assert.ok(oneWay.includes("inbound_stage: 'AUTHORIZATION'"),'manual sync must expose a privacy-safe inbound stage until the dedicated preview adapter is wired');
assert.ok(oneWay.includes("inbound_reason: 'APP_CREATED_SCOPE_ONLY'"),'legacy outbound adapter must continue to describe its own app-created-only scope rather than pretending the new inbound credential belongs to it');
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

// Inbound read authorization is a separate credential lane. It deliberately reuses the already
// registered Calendar callback URI, but a purpose-bound state prefix dispatches to a dedicated
// callback and it never updates outbound account/calendar/watch/sync state.
for(const marker of [
  'calendar.calendarlist.readonly',
  'calendar.events.readonly',
  "STATE_PREFIX='gcin1'",
  "STATE_PURPOSE='GOOGLE_CALENDAR_INBOUND_READ'",
  "prompt','consent'",
  "include_granted_scopes','false'",
  'google_calendar_inbound_authorizations',
  "['OWNER','ADMIN']",
  'encryptRefreshToken',
]) assert.ok(inboundAuth.includes(marker),`Google inbound authorization guard missing: ${marker}`);
assert.ok(!inboundAuth.includes('external_calendar_accounts'),'inbound OAuth callback must not overwrite the outbound Calendar credential/account row');
assert.ok(!inboundAuth.includes('/calendar/v3'),'authorization stage must not read live Calendar content yet');
for(const forbidden of ['INSERT INTO tasks','UPDATE tasks','DELETE FROM tasks','calendar_sync_outbox','calendar_sync_state','external_calendar_watch_channels']) assert.ok(!inboundAuth.includes(forbidden),`authorization stage must not mutate Calendar projection/task state: ${forbidden}`);
assert.ok(exceptionRoutes.includes("'/oauth/google-calendar/inbound/authorize'"),'explicit inbound authorization route missing');
assert.ok(publicRoutes.includes('isGoogleCalendarInboundOAuthState'),'shared callback URI must dispatch by purpose-bound inbound state');
assert.ok(publicRoutes.includes('googleCalendarInboundCallback(request,env)'),'inbound callback dispatch missing');
assert.ok(calendarEntry.includes('Google Calendarの読み取りを許可'),'integrations UI must make the extra read consent explicit');
assert.ok(calendarEntry.includes('予定の選択・プレビューは次の段階で有効化します'),'authorization UI must not imply that live preview/apply already exists');
for(const marker of [
  'google_calendar_inbound_authorizations',
  'family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE',
  'member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE',
  'refresh_token_ciphertext TEXT NOT NULL',
  'granted_scopes TEXT NOT NULL',
  "CHECK(status IN ('ACTIVE','REVOKED'))",
]) assert.ok(inboundAuthMigration.includes(marker),`inbound authorization persistence missing: ${marker}`);
assert.ok(!inboundAuthMigration.includes('REFERENCES external_calendar_accounts'),'inbound authorization storage must not depend on the outbound account row');

// Safety classifier stays pure, and the new authorization step is still incapable of importing
// or mutating FamilyToDo tasks. Live read-only preview and later apply remain separate reviews.
for(const forbidden of [
  'INSERT INTO tasks',
  'UPDATE tasks',
  'DELETE FROM tasks',
  'INSERT INTO google_calendar_inbound_links',
  'UPDATE google_calendar_inbound_links',
  'DELETE FROM google_calendar_inbound_links',
  'fetch(',
]) assert.ok(!inboundSafety.includes(forbidden),`inbound safety foundation must remain pure/read-only: ${forbidden}`);
assert.ok(!apiRoutes.includes("'/api/google-calendar/inbound-apply'"),'Google inbound apply route must not exist in the authorization stage');
assert.ok(!apiRoutes.includes("'/api/google-calendar/inbound-preview'"),'live Google inbound preview must remain absent until the authorization lane is reviewed');

console.log('google-calendar-inbound-contract: outbound lane stays isolated; explicit read-only inbound OAuth is purpose-bound and still cannot read/apply Calendar events');
