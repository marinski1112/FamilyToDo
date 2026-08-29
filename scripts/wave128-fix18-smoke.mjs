import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry=fs.readFileSync('src/google-calendar.ts','utf8');
const core=fs.readFileSync('src/google-calendar-core.ts','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(entry,/export \* from '\.\/google-calendar-core'/,'entrypoint must preserve the existing Google Calendar core exports');
assert.match(entry,/INBOUND_PAGE_SIZE = 25/,'inbound work must be bounded per Worker invocation');
assert.match(entry,/OUTBOX_LIMIT = 20/,'outbound work must be bounded below the free-plan external subrequest ceiling');
assert.match(entry,/PAGE_PREFIX = 'PAGE:'/,'partial inbound pagination must be persisted across invocations');
assert.match(entry,/encodePageState\(syncToken, nextPageToken\)/,'next Google page token must be checkpointed');
assert.match(entry,/pendingAfter > 0 \|\| incoming\.more/,'sync response must report remaining bounded work');
assert.match(entry,/INSERT INTO calendar_sync_outbox/,'history backfill must use bulk outbox enqueue rather than per-event Google calls');
assert.match(entry,/target_count: count/,'history preview must report the complete event count');
assert.doesNotMatch(entry,/LIMIT 1000/,'bounded wrapper must not reintroduce the old 1000-event history cap');
assert.match(entry,/calendar-backfill-limit\{display:none!important\}/,'obsolete 1000-item UI warning must be suppressed after pagination support');
assert.match(core,/processCalendarOutbox/,'original projection lifecycle must remain preserved in the core module');
assert.match(core,/String\(o\.operation\)==='DELETE'/,'idempotent DELETE behavior must remain preserved in core');
assert.ok(runner.includes('wave128-fix${n}-smoke.mjs')&&/\b18\b/.test(runner),'fix18 smoke must run through the consolidated regression suite');

console.log('wave128 fix18 smoke: bounded Google Calendar paging and full-history queueing ok');
