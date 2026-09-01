import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

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
assert.ok(!index.includes('processCalendarInbound'),'scheduled Worker entrypoint must not run normal Calendar inbound mutation');
assert.ok(index.includes('processCalendarOutbox(env)'),'scheduled outbound Calendar projection must remain present');
assert.ok(index.includes('renewCalendarWatches(env)'),'calendar watch renewal must remain present');

console.log('google-calendar-inbound-contract: inbound implementation remains bounded while scheduled runtime is outbound-only and watch renewal is preserved');
