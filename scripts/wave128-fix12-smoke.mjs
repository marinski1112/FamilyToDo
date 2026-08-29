import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.match(calendar,/action==='diagnose_projection'/,'backfill endpoint must expose authenticated projection diagnostics');
assert.match(calendar,/action==='rebind_projection'/,'backfill endpoint must expose explicit projection rebind');
assert.match(calendar,/calendarStatus='OK'/,'diagnostics must distinguish a reachable Google calendar');
assert.match(calendar,/MISSING_CALENDAR/,'diagnostics must distinguish a missing Google subcalendar');
assert.match(calendar,/Google Calendar HTTP\\s\+\(\\d\{3\}\)/,'diagnostics must sanitize stored Google HTTP errors');
assert.match(calendar,/confirm!=='CREATE_NEW_CALENDAR'/,'rebind must require an explicit confirmation token');
assert.match(calendar,/api\('\/calendars',token,\{method:'POST'/,'rebind must create a new app-owned Google calendar');
assert.match(calendar,/UPDATE external_calendar_links SET deleted_at=\?/,'rebind must detach existing projection links without deleting Family TODO tasks');
assert.match(calendar,/DELETE FROM calendar_sync_outbox WHERE family_id=\? AND provider=\?/,'rebind must clear old projection outbox state');
assert.match(calendar,/calendar_id=\?,calendar_name='Family TODO'/,'account must switch to the newly created calendar');
assert.match(calendar,/external_calendar_links WHERE provider=\? AND task_id=\? AND family_id=\? AND deleted_at IS NULL/,'outbound must ignore detached old links');
assert.match(calendar,/external_event_id=\? AND deleted_at IS NULL/,'inbound must ignore detached old links');
assert.match(pwa,/calendarProjectionDiagnose/,'integration UI must provide a projection diagnostic action');
assert.match(pwa,/calendarProjectionRebind/,'integration UI must provide the guarded rebind action');
assert.match(pwa,/CREATE_NEW_CALENDAR/,'UI rebind must send the explicit confirmation token');
assert.match(pwa,/familyCsrf/,'Family Log quick action CSRF must stay isolated from integration-page CSRF');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must stay in the Wave128 safe-fix namespace');
assert.match(ci,/node scripts\/wave128-fix12-smoke\.mjs/,'fix12 smoke must run in CI');

console.log('wave128 fix12 smoke: Google Calendar missing-subcalendar diagnostics and safe projection rebind ok');
