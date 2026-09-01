import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');

for(const marker of [
  'queueCalendarProjectionAfterMutation',
  "link?'UPDATE':'CREATE'",
  'if(link)return enqueueCalendarSync',
  'calendarBackfill',
  'pending_before',
  'pending_after',
  '変更はありません',
]) assert.ok(calendar.includes(marker),marker);

assert.ok(apiRoutes.includes("'/api/google-calendar/backfill'"),'Calendar backfill route must remain registered');
assert.ok((index.match(/queueCalendarProjectionAfterMutation/g)||[]).length>=3,'index mutation routes must keep Calendar projection queue hooks');
assert.ok((app.match(/queueCalendarProjectionAfterMutation/g)||[]).length>=4,'app mutation handlers must keep Calendar projection queue hooks');

console.log('calendar-projection-queue-contract: mutation queue hooks, backfill route, and pending diagnostics ok');
