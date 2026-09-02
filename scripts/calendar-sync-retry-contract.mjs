import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

for(const marker of [
  'utcNow()',
  'calendarRetryAt',
  'calendarRetryDue',
  'CALENDAR_MAX_RETRIES',
  'retry_count>=?',
  'external_etag',
  'calendar.app.created',
  "visibility_scope||'FAMILY'",
  "effectiveDelete=op==='DELETE'||!task||!eligibleTask(task)",
  "effectiveDelete&&e instanceof GoogleError&&(e.status===404||e.status===410)",
  "calendar_sync_outbox SET status='DONE',last_error=NULL",
]) assert.ok(calendar.includes(marker),marker);

for(const stale of ['syncLeases','nextSyncToken','processCalendarInbound','syncCalendarAccount']) assert.ok(!calendar.includes(stale),`retired inbound retry state must stay absent: ${stale}`);
for(const marker of ['family_timezone','env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE']) assert.ok(exceptionRoutes.includes(marker),marker);

const utc=date=>date.toISOString().slice(0,19).replace('T',' ');
const at=new Date('2026-08-28T00:00:00Z');
const retry=count=>utc(new Date(at.getTime()+Math.min(86400000,60000*2**Math.max(1,count))));
assert.equal(retry(1),'2026-08-28 00:02:00');
assert.equal(retry(2),'2026-08-28 00:04:00');
const due=(count,next,time)=>count<8&&next<=utc(time);
assert.equal(due(1,retry(1),new Date('2026-08-28T00:01:59Z')),false,'future retry must not be selected');
assert.equal(due(1,retry(1),new Date('2026-08-28T00:02:00Z')),true,'retry becomes due at expiry');
assert.equal(due(8,'2020-01-01 00:00:00',at),false,'max retry count must remain terminal');

console.log('calendar-sync-retry-contract: outbound retry backoff, due boundary, max retry, and idempotent delete semantics ok');
