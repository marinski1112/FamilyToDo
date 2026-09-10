import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendarEntry=fs.readFileSync('src/google-calendar.ts','utf8');
const calendarCore=fs.readFileSync('src/google-calendar-core.ts','utf8');
const calendar=calendarEntry+calendarCore;
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const inboundAuto=fs.readFileSync('src/google-calendar-inbound-auto.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
const calendarImport=fs.readFileSync('src/calendar-ics-import.ts','utf8');
const inboundSafety=fs.readFileSync('src/google-calendar-inbound-safety.ts','utf8');
const inboundAuth=fs.readFileSync('src/google-calendar-inbound-auth.ts','utf8');
const inboundPreview=fs.readFileSync('src/google-calendar-inbound-preview.ts','utf8');
const inboundApply=fs.readFileSync('src/google-calendar-inbound-apply.ts','utf8');
const inboundUi=fs.readFileSync('public/assets/google-calendar-inbound.js','utf8');
const inboundIdentityMigration=fs.readFileSync('migrations/0072_google_calendar_inbound_identity.sql','utf8');
const inboundAuthMigration=fs.readFileSync('migrations/0073_google_calendar_inbound_authorization.sql','utf8');
const inboundApplyGuardMigration=fs.readFileSync('migrations/0074_google_calendar_inbound_apply_guard.sql','utf8');
const inboundAutoMigration=fs.readFileSync('migrations/0075_google_calendar_inbound_auto_sync.sql','utf8');

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
assert.ok(apiRoutes.includes('calendarSyncOutboundOnly(request,context)'),'existing manual Calendar sync must preserve the app-owned outbound adapter');
assert.ok(publicRoutes.includes('calendarWatchNotification(request,env,ctx)'),'existing app-owned Calendar watch must remain authenticated and may only wake the separate bounded inbound worker');
assert.ok(oneWay.includes('ctx.waitUntil(processGoogleCalendarInboundAuto(env,familyId))'),'verified watch must wake bounded inbound work asynchronously');
assert.ok(!oneWay.includes('INSERT INTO tasks')&&!oneWay.includes('UPDATE tasks')&&!oneWay.includes('DELETE FROM tasks'),'public watch handler itself must not mutate task data');
assert.ok(oneWay.includes('processCalendarOutbox(ctx.env, OUTBOX_LIMIT, familyId)'),'manual sync must preserve outbound projection');
assert.ok(oneWay.includes('received: 0'),'existing outbound adapter must not claim that inbound records were imported');
assert.ok(oneWay.includes("inbound_stage: 'AUTHORIZATION'"),'legacy manual sync diagnostics remain scoped to the outbound adapter');
assert.ok(oneWay.includes("inbound_reason: 'APP_CREATED_SCOPE_ONLY'"),'legacy outbound adapter must continue to describe its own app-created-only scope');
assert.ok(oneWay.includes('inbound_more: false'),'existing outbound adapter must preserve inbound_more compatibility as false');
assert.ok(oneWay.includes("UPDATE external_calendar_watch_channels SET last_notification_at=?"),'watch notification health timestamp must remain present');
assert.ok(index.includes('processCalendarOutbox(env)'),'scheduled outbound Calendar projection must remain present');
assert.ok(index.includes('processGoogleCalendarInboundAuto(env)'),'five-minute inbound recovery must remain present');
assert.ok(index.includes('renewCalendarWatches(env)'),'calendar watch renewal must remain present');
for(const marker of ['google_calendar_inbound_sync_state','sync_token','page_token','bootstrap_since'])assert.ok(inboundAutoMigration.includes(marker),`automatic inbound state missing: ${marker}`);
for(const marker of ["a.provider=? AND a.status='ACTIVE'","String(event.status||'')==='cancelled'","==='NEW_CANDIDATE'",'env.DB.batch(statements)','INSERT INTO google_calendar_inbound_links'])assert.ok(inboundAuto.includes(marker),`automatic inbound guard missing: ${marker}`);
for(const forbidden of ['UPDATE tasks SET','DELETE FROM tasks'])assert.ok(!inboundAuto.includes(forbidden),`automatic inbound must not overwrite/delete local task data: ${forbidden}`);

// Existing ICS import remains an independent, preview-first path. Its UID ledger is secondary
// collision evidence only; Google calendarId + event.id remains the inbound primary identity.
for(const marker of ['calendarImportPreview','calendarImportPrepare','calendarImportApply',"source_format='ICS'"]) assert.ok(calendarImport.includes(marker),`safe calendar-import primitive missing: ${marker}`);
assert.ok(calendarImport.includes('visibility_scope,private_owner_id'),'calendar import task insert must explicitly retain visibility ownership columns');
assert.ok(calendarImport.includes("'EVENT',0,'FAMILY',NULL"),'calendar import apply must create FAMILY-visible EVENT rows rather than PRIVATE rows');
assert.ok(apiRoutes.includes("'/api/calendar-import/preview'"),'calendar import preview route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/prepare'"),'calendar import prepare route must remain available');
assert.ok(apiRoutes.includes("'/api/calendar-import/apply'"),'calendar import apply route must remain available');
assert.ok(calendarImport.includes("String(b.csrf||'')!==String(ctx.session.csrfToken||'')"),'calendar import must retain CSRF protection');
assert.ok(calendarImport.includes("['OWNER','ADMIN']"),'calendar import must remain OWNER/ADMIN scoped');

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
assert.ok(!inboundIdentityMigration.includes('UNIQUE(family_id, ical_uid)'), 'iCalUID must not be the Google primary unique identity');
assert.ok(!inboundIdentityMigration.includes('account_id INTEGER NOT NULL'),'account provenance must not force deletion of dedupe identity on account removal');
assert.ok(!inboundIdentityMigration.includes('account_id INTEGER NOT NULL REFERENCES external_calendar_accounts(id) ON DELETE CASCADE'),'account deletion must never cascade-delete inbound dedupe history');

for(const marker of [
  'GOOGLE_CALENDAR_INBOUND_MAX_EVENTS=250','APP_OWNED_CALENDAR_BLOCKED','CHILD_JOURNAL_CALENDAR_BLOCKED','INVALID_EVENT_ID','RECURRING_UNSUPPORTED','APP_OWNED_MARKER','ALREADY_IMPORTED','ALREADY_LINKED_OUTBOUND','ICS_ALREADY_IMPORTED','AMBIGUOUS_EXISTING_LOCAL','NEW_CANDIDATE','familyTodoTaskId','localScanTruncated',
]) assert.ok(inboundSafety.includes(marker),`Google inbound fail-closed classifier missing: ${marker}`);

// Read authorization is still a separate credential lane and never updates the outbound account.
for(const marker of [
  'calendar.calendarlist.readonly','calendar.events.readonly',"STATE_PREFIX='gcin1'","STATE_PURPOSE='GOOGLE_CALENDAR_INBOUND_READ'","prompt','consent'","include_granted_scopes','false'",'google_calendar_inbound_authorizations',"['OWNER','ADMIN']",'encryptRefreshToken',
]) assert.ok(inboundAuth.includes(marker),`Google inbound authorization guard missing: ${marker}`);
assert.ok(!inboundAuth.includes('external_calendar_accounts'),'inbound OAuth callback must not overwrite the outbound Calendar credential/account row');
assert.ok(!inboundAuth.includes('/calendar/v3'),'authorization stage must not read live Calendar content');
for(const forbidden of ['INSERT INTO tasks','UPDATE tasks','DELETE FROM tasks','calendar_sync_outbox','calendar_sync_state','external_calendar_watch_channels']) assert.ok(!inboundAuth.includes(forbidden),`authorization stage must not mutate Calendar projection/task state: ${forbidden}`);
assert.ok(exceptionRoutes.includes("'/oauth/google-calendar/inbound/authorize'"),'explicit inbound authorization route missing');
assert.ok(publicRoutes.includes('isGoogleCalendarInboundOAuthState'),'shared callback URI must dispatch by purpose-bound inbound state');
assert.ok(publicRoutes.includes('googleCalendarInboundCallback(request,env)'),'inbound callback dispatch missing');
for(const marker of ['google_calendar_inbound_authorizations','family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE','member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE','refresh_token_ciphertext TEXT NOT NULL','granted_scopes TEXT NOT NULL',"CHECK(status IN ('ACTIVE','REVOKED'))"]) assert.ok(inboundAuthMigration.includes(marker),`inbound authorization persistence missing: ${marker}`);
assert.ok(!inboundAuthMigration.includes('REFERENCES external_calendar_accounts'),'inbound authorization storage must not depend on the outbound account row');

// Live Google read is deliberately limited to an authenticated, CSRF-protected OWNER/ADMIN
// preview. CHILD_JOURNAL is blocked; app-owned hub events are classified individually to stop loops.
for(const marker of [
  "const MAX_RANGE_DAYS=90","const LOCAL_COLLISION_LIMIT=500","const EVIDENCE_BIND_CHUNK=80",
  'GOOGLE_CALENDAR_INBOUND_MAX_EVENTS','google_calendar_inbound_authorizations','decryptRefreshToken',
  "['OWNER','ADMIN']","String(body.csrf||'')!==String(ctx.session.csrfToken||'')",
  '/calendar/v3/users/me/calendarList','googleCalendarInboundCalendarBlockReason',
  "url.searchParams.set('timeMin',timeMin)","url.searchParams.set('timeMax',timeMax)",
  "url.searchParams.set('showDeleted','false')","url.searchParams.set('singleEvents','false')",
  'GOOGLE_CALENDAR_INBOUND_MAX_EVENTS-rawEvents.length','nextPageToken',
  'parseImportDateTime','formatFamilyDateTime',"taskKind:'EVENT'","calendarVisible:1","visibilityScope:'FAMILY'",
  'google_calendar_inbound_links','external_calendar_links','calendar_import_entries','localScanTruncated',
  'classifyGoogleCalendarInboundEvent','read_only:true',
]) assert.ok(inboundPreview.includes(marker),`Google inbound preview guard missing: ${marker}`);
const previewHandler=inboundPreview.slice(inboundPreview.indexOf('export async function googleCalendarInboundPreview'));
assert.ok(previewHandler.indexOf('googleCalendarInboundCalendarBlockReason(calendarId')<previewHandler.indexOf('const access=await inboundAccessToken(ctx);'), 'calendar-level safety check must run before live events access');
for(const forbidden of ['INSERT INTO ','UPDATE google_calendar_inbound','UPDATE external_calendar','UPDATE calendar_sync','UPDATE tasks','DELETE FROM ','calendar_sync_outbox','external_calendar_watch_channels']) assert.ok(!inboundPreview.includes(forbidden),`read-only preview must not mutate app or projection state: ${forbidden}`);
assert.ok(!inboundPreview.includes("singleEvents','true'"),'recurring events must not be expanded while recurrence import is unsupported');
assert.ok(!inboundPreview.includes('console.log')&&!inboundPreview.includes('console.error'),'preview must not log Calendar/private event data');

assert.ok(apiRoutes.includes("'/api/google-calendar/inbound-calendars'"),'selected-calendar discovery route missing');
assert.ok(apiRoutes.includes('googleCalendarInboundCalendars(request,context)'),'calendar discovery route wiring missing');
assert.ok(apiRoutes.includes("'/api/google-calendar/inbound-preview'"),'read-only inbound preview route missing');
assert.ok(apiRoutes.includes('googleCalendarInboundPreview(request,context)'),'preview route wiring missing');
assert.ok(apiRoutes.includes("'/api/google-calendar/inbound-apply'"),'explicit inbound apply route missing');
assert.ok(apiRoutes.includes('googleCalendarInboundApply(request,context)'),'inbound apply route wiring missing');

// Apply never trusts client event contents. It replays the server preview, admits only current
// NEW_CANDIDATE rows, and writes a FAMILY EVENT + primary Google identity in one D1 transaction.
for(const marker of [
  'GOOGLE_CALENDAR_INBOUND_APPLY_MAX_EVENTS=15',
  "['OWNER','ADMIN']",
  "String(body.csrf||'')!==String(ctx.session.csrfToken||'')",
  'googleCalendarInboundPreview(replayPreviewRequest(request,ctx,body),ctx)',
  "String(value.classification||'')==='NEW_CANDIDATE'",
  "String(value.task_kind||'')==='EVENT'",
  "String(value.visibility_scope||'')==='FAMILY'",
  'ctx.env.DB.batch(statements)',
  'INSERT INTO tasks',
  "'EVENT',0,'FAMILY',NULL",
  'INSERT INTO google_calendar_inbound_links',
  'last_insert_rowid()',
  "google_mutation:'none'",
  "outbound_projection:'blocked_for_inbound_identity'",
  "recurrence_import:'unsupported'",
]) assert.ok(inboundApply.includes(marker),`Google inbound apply guard missing: ${marker}`);
for(const forbidden of ['/calendar/v3','external_calendar_links','calendar_sync_outbox','recurrence_rules','UPDATE tasks','DELETE FROM tasks','console.log','console.error']) assert.ok(!inboundApply.includes(forbidden),`inbound apply must not mutate Google/outbound/recurrence state: ${forbidden}`);
assert.ok(!inboundApply.includes('body.title')&&!inboundApply.includes('body.description')&&!inboundApply.includes('body.location'),'client event content must never become task input');

// Database-level projection guard makes the one-way import boundary durable across future task edits
// and manual backfill code paths that enqueue via INSERT ... ON CONFLICT.
for(const marker of [
  'trg_google_calendar_inbound_clear_outbox_insert',
  'trg_google_calendar_inbound_clear_outbox_update',
  'trg_google_calendar_inbound_block_outbox_insert',
  'BEFORE INSERT ON calendar_sync_outbox',
  "NEW.provider='GOOGLE_CALENDAR'",
  'google_calendar_inbound_links',
  'SELECT RAISE(IGNORE)',
  'DELETE FROM calendar_sync_outbox',
]) assert.ok(inboundApplyGuardMigration.includes(marker),`Google inbound outbound-projection guard missing: ${marker}`);
assert.ok(!inboundApplyGuardMigration.includes('DELETE FROM google_calendar_inbound_links'),'projection guard must preserve inbound dedupe history');

// UI exposes explicit selection and dates, renders private event text only with textContent, and
// enables an explicit bounded apply action only for rows classified NEW_CANDIDATE.
new Function(inboundUi);
for(const marker of ['googleCalendarInboundLoad','googleCalendarInboundCalendar','googleCalendarInboundFrom','googleCalendarInboundTo','googleCalendarInboundPreviewButton','googleCalendarInboundApplyButton','google-calendar-inbound-apply-check','/api/google-calendar/inbound-calendars','/api/google-calendar/inbound-preview','/api/google-calendar/inbound-apply','NEW_CANDIDATE','APPLY_MAX=15','textContent','Google Calendar側は変更しません']) assert.ok(inboundUi.includes(marker),`inbound UI marker missing: ${marker}`);
assert.ok(!inboundUi.includes('innerHTML'),'remote Calendar/private event data must never flow through innerHTML');
assert.ok(calendarEntry.includes('/assets/google-calendar-inbound.js'),'integrations settings must load the bounded inbound preview/apply UI');
assert.ok(calendarEntry.includes('読み取り専用プレビューです。ここではFamilyToDoにもGoogle Calendarにも書き込みません。'),'settings copy must state the preview read-only boundary');
assert.ok(calendarEntry.includes('取り込み元カレンダーと期間を選んで、安全性を確認できます。'),'settings must expose the preview as available after authorization');
assert.ok(calendarEntry.includes("const googleTasksCardMarker='<div class=\"card\"><h2>Google Tasks</h2>'"),'settings must locate the boundary immediately after the Google Calendar card');
assert.ok(calendarEntry.includes("source.lastIndexOf('</div>',googleTasksCardStart)"),'inbound controls must target the closing edge of the existing Google Calendar card');
assert.ok(calendarEntry.includes('source.slice(0,googleCalendarCardClose)+inboundPanel+source.slice(googleCalendarCardClose)'),'inbound controls must be inserted inside the Google Calendar card rather than appended at page bottom');
assert.ok(calendarEntry.includes('calendar-inbound-auth-btn'),'inbound authorization control must retain a mobile-sized in-card button');

for(const forbidden of ['INSERT INTO tasks','UPDATE tasks','DELETE FROM tasks','INSERT INTO google_calendar_inbound_links','UPDATE google_calendar_inbound_links','DELETE FROM google_calendar_inbound_links','fetch(']) assert.ok(!inboundSafety.includes(forbidden),`inbound safety classifier must remain pure/read-only: ${forbidden}`);

console.log('google-calendar-inbound-contract: dedicated OAuth, bounded preview/apply, automatic app-owned NEW_CANDIDATE creation, atomic identity, and outbound projection guard are enforced');
