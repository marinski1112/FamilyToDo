import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const app=retainedAppContractSource();
for(const marker of ['queueCalendarProjectionAfterMutation',"link?'UPDATE':'CREATE'",'if(link)return enqueueCalendarSync','calendarBackfill'])assert.ok(calendar.includes(marker),marker);
for(const marker of ['pending_before','pending_after','received: 0','inbound_more: false'])assert.ok(oneWay.includes(marker),marker);
assert.ok(calendar.includes('変更はありません'),'settings manual sync must keep the unchanged-state message');
assert.ok(apiRoutes.includes("'/api/google-calendar/backfill'"),'Calendar backfill route must remain registered');
assert.ok(apiRoutes.includes('calendarSyncOutboundOnly(request,context)'),'manual Calendar sync must use the one-way adapter');
assert.ok(((index+taskDelete).match(/queueCalendarProjectionAfterMutation/g)||[]).length>=3,'index-routed mutation handlers must keep Calendar projection queue hooks');
assert.ok((app.match(/queueCalendarProjectionAfterMutation/g)||[]).length>=4,'retained mutation handlers must keep Calendar projection queue hooks');
console.log('calendar-projection-queue-contract: mutation queue hooks, backfill route, one-way pending diagnostics, and unchanged-state UI ok');
