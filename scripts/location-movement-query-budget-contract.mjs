import assert from 'node:assert/strict';
import fs from 'node:fs';

const summary=fs.readFileSync('src/location-day-summary.ts','utf8');
const service=fs.readFileSync('src/location-query-service.ts','utf8');
const tasks=fs.readFileSync('src/google-tasks.ts','utf8');

assert.match(tasks,/export const MAX_D1_QUERY_BUDGET=40;/,'Google Tasks D1 query budget must remain explicit');
assert.match(tasks,/export const MAX_TASKS_PER_INVOCATION=3;/,'Google Tasks per-invocation task cap must remain explicit');
assert.match(summary,/historyForSubjects\(/,'family movement summaries must use the batched Location history reader');
assert.doesNotMatch(summary,/service\.history\(\{\s*scope:\{familyId,requesterMemberId\},subjectMemberId/,'family movement summaries must not regress to one history statement per member');
assert.match(service,/const MAX_BATCH_SUBJECTS=12;/,'batch reader must match the family summary member cap');
assert.match(service,/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY h\.member_id/,'batch reader must retain per-member newest-point ranking');
assert.match(service,/WHERE member_rank<=\?/,'batch reader must cap points independently per member');
assert.match(service,/device\.enabled=1[\s\S]*device\.sharing_enabled=1[\s\S]*device\.revoked_at IS NULL/,'batch reader must preserve device privacy filters');
assert.match(service,/requester\.id=\? AND requester\.family_id=\? AND requester\.active=1/,'batch reader must preserve requester tenant validation');

console.log('location-movement-query-budget-contract: one bounded family history statement per day with existing privacy filters');
