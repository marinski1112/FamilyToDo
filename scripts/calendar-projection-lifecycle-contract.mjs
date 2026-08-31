import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const pwa=fs.readFileSync('public/assets/pwa.js','utf8');

assert.match(calendar,/action==='diagnose_projection'/,'projection diagnostics endpoint must remain available');
assert.match(calendar,/action==='rebind_projection'/,'guarded projection rebind endpoint must remain available');
assert.match(calendar,/calendarStatus='OK'/,'diagnostics must distinguish a reachable Google calendar');
assert.match(calendar,/MISSING_CALENDAR/,'diagnostics must distinguish a missing Google subcalendar');
assert.match(calendar,/Google Calendar HTTP\\s\+\(\\d\{3\}\)/,'diagnostics must sanitize stored Google HTTP errors');
assert.match(calendar,/confirm!=='CREATE_NEW_CALENDAR'/,'rebind must require an explicit confirmation token');
assert.match(calendar,/api\('\/calendars',token,\{method:'POST'/,'rebind must create a new app-owned Google calendar');
assert.match(calendar,/UPDATE external_calendar_links SET deleted_at=\?/,'rebind must detach old projection links without deleting Family TODO tasks');
assert.match(calendar,/DELETE FROM calendar_sync_outbox WHERE family_id=\? AND provider=\?/,'rebind must clear old projection outbox state');
assert.match(calendar,/calendar_id=\?,calendar_name='Family TODO'/,'account must switch to the newly created calendar');
assert.match(calendar,/external_calendar_links WHERE provider=\? AND task_id=\? AND family_id=\? AND deleted_at IS NULL/,'outbound must ignore detached old links');
assert.match(calendar,/external_event_id=\? AND deleted_at IS NULL/,'inbound must ignore detached old links');
assert.match(calendar,/let effectiveDelete=false/,'outbox must track the operation actually executed');
assert.match(calendar,/effectiveDelete=op==='DELETE'\|\|!task\|\|!eligibleTask\(task\)/,'missing or ineligible tasks must be treated as effective deletes');
assert.match(calendar,/if\(effectiveDelete&&e instanceof GoogleError&&\(e\.status===404\|\|e\.status===410\)\)/,'404/410 must be idempotent success for every effective delete');
assert.doesNotMatch(calendar,/String\(o\.operation\)==='DELETE'&&e instanceof GoogleError/,'not-found handling must not depend only on the queued operation label');
assert.match(pwa,/calendarProjectionDiagnose/,'integration UI must expose projection diagnostics');
assert.match(pwa,/calendarProjectionRebind/,'integration UI must expose guarded projection rebind');
assert.match(pwa,/CREATE_NEW_CALENDAR/,'UI rebind must send the explicit confirmation token');
assert.match(pwa,/familyCsrf/,'Family Log quick-action CSRF must remain isolated from integration-page CSRF');

console.log('calendar-projection-lifecycle-contract: diagnostics, guarded rebind, and effective-delete idempotency contract ok');
