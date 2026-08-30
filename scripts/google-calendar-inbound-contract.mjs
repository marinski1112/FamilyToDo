import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');

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
for(const marker of ["'/api/google-calendar/sync'",'processCalendarInbound(env)']) assert.ok(index.includes(marker),marker);

console.log('google-calendar-inbound-contract: sync token, inbound projection, revoke, visibility, and encrypted refresh-token markers ok');
