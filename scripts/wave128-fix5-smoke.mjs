import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.match(calendar,/function repairRecurringBandLinks\(/,'calendar.js must own recurring band repair');
assert.match(calendar,/recurrence_rule_id/);
assert.match(calendar,/recurrence_occurrence_id/);
assert.match(calendar,/occurrence_date/);
assert.match(calendar,/a\.calendar-band\[data-task-id\]/);
assert.match(calendar,/\/app\/recurring\.php\?/);
assert.match(calendar,/gridNow\.innerHTML=nextGrid\.innerHTML;[\s\S]*?detail=payload\.detail\|\|\{\};[\s\S]*?repairRecurringBandLinks\(gridNow\)/,'AJAX month replacement must repair links using the new detail payload');
assert.match(calendar,/repairRecurringBandLinks\(document\.querySelector\('\.calendar-grid'\)\)/,'initial calendar grid must also be repaired');
assert.match(ci,/node scripts\/wave128-fix5-smoke\.mjs/,'fix5 smoke must run in CI');
console.log('wave128 fix5 smoke: recurring calendar bands repair on initial and AJAX month render');
