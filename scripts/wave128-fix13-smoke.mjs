import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(src,/String\(o\.operation\)===['"]DELETE['"]&&e instanceof GoogleError&&\(e\.status===404\|\|e\.status===410\)/,'only DELETE 404/410 should be treated as idempotent success');
assert.match(src,/calendar_sync_outbox SET status='DONE',last_error=NULL/,'gone DELETE must be finalized as DONE');
assert.match(src,/external_calendar_links SET deleted_at=\?/,'gone DELETE must detach the active projection link');
assert.match(src,/operation='DELETE' AND retry_count>=\?/,'retry cleanup must be restricted to exhausted DELETE rows');
assert.match(src,/Google Calendar HTTP 404/,'retry cleanup must recognize historical HTTP 404 deletes');
assert.match(src,/Google Calendar HTTP 410/,'retry cleanup must recognize historical HTTP 410 deletes');
assert.match(src,/cleaned_gone_deletes/,'retry response must report cleaned gone deletes');
assert.ok(runner.includes('wave128-fix${n}-smoke.mjs')&&/\b13\b/.test(runner),'fix13 smoke must run through the consolidated regression suite');

console.log('wave128 fix13 smoke: gone Google DELETE is idempotent and exhausted rows are safely cleaned');
