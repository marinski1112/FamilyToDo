import assert from 'node:assert/strict';
import fs from 'node:fs';

const auto=fs.readFileSync('src/google-calendar-inbound-auto.ts','utf8');
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const schedule=fs.readFileSync('src/scheduled-dispatch.ts','utf8');
const tasks=fs.readFileSync('src/google-tasks.ts','utf8');
const migration=fs.readFileSync('migrations/0075_google_calendar_inbound_auto_sync.sql','utf8');

for(const marker of [
  'google_calendar_inbound_sync_state',"CHECK(phase IN ('BOOTSTRAP','ACTIVE'))",'sync_token TEXT','page_token TEXT','bootstrap_since TEXT NOT NULL','lease_token TEXT','lease_expires_at INTEGER','last_synced_at TEXT','last_error TEXT',
]) assert.ok(migration.includes(marker),`auto-sync state guard missing: ${marker}`);

for(const marker of [
  'google_calendar_inbound_authorizations','external_calendar_accounts','a.calendar_id','GOOGLE_CALENDAR_INBOUND_SCOPES','decryptRefreshToken',
  "url.searchParams.set('showDeleted','true')","url.searchParams.set('singleEvents','false')","url.searchParams.set('syncToken',state.syncToken)","url.searchParams.set('pageToken',state.pageToken)",
  'nextPageToken','nextSyncToken','response.status===410','resetExpiredToken','INITIAL_OVERLAP_MS=10*60*1000','event.updated',
  'classifyGoogleCalendarInboundEvent',"==='NEW_CANDIDATE'",'AUTO_CREATE_MAX=15','ctx.env.DB.batch',
]) {
  const normalized=marker==='ctx.env.DB.batch'?'env.DB.batch':marker;
  assert.ok(auto.includes(normalized),`automatic inbound guard missing: ${normalized}`);
}

assert.ok(auto.includes("a.provider=? AND a.status='ACTIVE'"),'automatic inbound must use the app-owned outbound account/calendar identity');
assert.ok(!auto.includes('/calendar/v3/users/me/calendarList'),'automatic inbound must not enumerate/import arbitrary calendars');
assert.ok(auto.includes("String(event.status||'')==='cancelled'"),'remote deletes/cancellations must be ignored');
assert.ok(auto.includes("basic!=='NEW_CANDIDATE'"),'recurrence/self-marker/invalid rows must fail closed before evidence work');
assert.ok(auto.includes('google_calendar_inbound_links')&&auto.includes('external_calendar_links')&&auto.includes('calendar_import_entries'),'all duplicate/self evidence must be retained');
assert.ok(auto.includes("'EVENT',0,'FAMILY',NULL"),'automatic imports must create FAMILY EVENT rows');
assert.ok(auto.includes('INSERT INTO google_calendar_inbound_links'),'automatic import must persist primary Google identity atomically with the task');
assert.ok(auto.includes('external_etag'),'Google etag evidence must be retained for future safe update semantics');
assert.ok(auto.includes("'GOOGLE_CALENDAR_INBOUND_AUTO_IMPORT'"),'automatic import must leave privacy-safe operational evidence');
for(const forbidden of ['UPDATE tasks SET','DELETE FROM tasks','DELETE FROM google_calendar_inbound_links','recurrence_rules','console.log','console.error'])assert.ok(!auto.includes(forbidden),`automatic inbound must not overwrite/delete/log private Calendar content: ${forbidden}`);
assert.ok(!auto.includes("method:'PATCH'")&&!auto.includes("method:'DELETE'"),'automatic inbound must never mutate Google Calendar');

assert.ok(oneWay.includes("import { processGoogleCalendarInboundAuto } from './google-calendar-inbound-auto'"),'verified Calendar watch must wire automatic inbound');
assert.ok(oneWay.includes('ctx.waitUntil(processGoogleCalendarInboundAuto(env,familyId))'),'verified watch must only wake background auto-sync after channel authentication');
assert.ok(publicRoutes.includes('calendarWatchNotification(request,env,ctx)'),'watch route must pass ExecutionContext for non-blocking wake-up');
assert.ok(index.includes(`run('calendar_inbound',processGoogleCalendarInboundAuto)`),'five-minute fallback must recover missed watch notifications');
assert.ok(index.includes('if(plan.fiveMinuteCore)'),'Calendar fallback must remain on the consolidated five-minute dispatch path');
assert.ok(schedule.includes('fiveMinuteCore: minute % 5 === 0'),'Calendar fallback cadence must remain bounded at five minutes');

// Google Tasks keeps its own independent minute-3 modulo-five cadence; this Calendar change must not replace it.
assert.ok(index.includes('if(plan.googleTasksInbound)'));
assert.ok(schedule.includes('googleTasksInbound: minute % 5 === 3'));
assert.ok(index.includes(`run('google_tasks_inbound',processGoogleTasksInbound)`));
assert.ok(tasks.includes('processGoogleTasksInbound'));

console.log('google-calendar-inbound-auto-sync-contract: verified watch + 5-minute fallback, syncToken pagination, bounded NEW_CANDIDATE creation, loop/delete/recurrence guards, and existing Google Tasks auto-inbound are intact');
