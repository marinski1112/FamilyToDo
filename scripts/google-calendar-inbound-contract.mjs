import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');

for(const marker of [
  'calendar.app.created',
  "q.set('syncToken',syncToken)",
  'nextSyncToken',
  "visibility_scope='FAMILY'",
  'calendar_visible=0',
  "status='REVOKED'",
  'processCalendarInbound',
  'plusDay',
]) assert.ok(calendar.includes(marker),marker);

assert.ok((calendar.match(/refresh_token_ciphertext/g)||[]).length>=2,'encrypted refresh token flow must remain present');
assert.ok(apiRoutes.includes("'/api/google-calendar/sync'"),'/api/google-calendar/sync');
assert.ok(apiRoutes.includes('calendarSyncOutboundOnly(request,context)'),'manual normal Calendar sync must use outbound-only adapter');
assert.ok(!apiRoutes.includes('calendarSyncNow(request,context)'),'manual normal Calendar sync must not call inbound-capable handler');
assert.ok(publicRoutes.includes('calendarWatchNotificationOnly(request,env)'),'Calendar watch route must use notification-only adapter');
assert.ok(!publicRoutes.includes('calendarWatchWebhook(request,env,ctx)'),'Calendar watch route must not call inbound-capable handler');
assert.ok(oneWay.includes('processCalendarOutbox(ctx.env, OUTBOX_LIMIT, familyId)'),'manual sync must preserve outbound projection');
assert.ok(oneWay.includes('received: 0'),'manual sync response must advertise no inbound projection');
assert.ok(oneWay.includes("UPDATE external_calendar_watch_channels SET last_notification_at=?"),'watch notification health timestamp must remain present');
assert.ok(!oneWay.includes('processCalendarInbound'),'runtime one-way adapter must not reference inbound mutation');
assert.ok(!index.includes('processCalendarInbound'),'scheduled Worker entrypoint must not run normal Calendar inbound mutation');
assert.ok(index.includes('processCalendarOutbox(env)'),'scheduled outbound Calendar projection must remain present');
assert.ok(index.includes('renewCalendarWatches(env)'),'calendar watch renewal must remain present');

console.log('google-calendar-inbound-contract: inbound implementation is retained only as dormant compatibility code while scheduled, manual-sync, and watch runtime entrypoints are outbound/notification-only');
