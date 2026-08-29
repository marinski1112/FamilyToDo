import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.match(calendar,/function repairEventBandFallbackColors\(/,'calendar.js must repair multi-day EVENT fallback colors');
assert.match(calendar,/new Set\(\['#7c3aed','#2563eb','#16a34a'/,'explicit supported calendar colors must be recognized');
assert.match(calendar,/String\(row\.task_kind\|\|''\)\.toLowerCase\(\)==='event'/,'only EVENT rows may receive the event fallback');
assert.match(calendar,/String\(row\.calendar_color\|\|''\)\.trim\(\)/,'raw calendar_color must decide whether fallback is needed');
assert.match(calendar,/isEvent&&!allowedColors\.has\(color\)\)link\.style\.background='#16a34a'/,'missing or invalid EVENT colors must fall back to green');
assert.match(calendar,/repairRecurringBandLinks\(gridNow\);repairEventBandFallbackColors\(gridNow\)/,'AJAX month replacement must repair EVENT fallback colors after loading the new detail payload');
assert.match(calendar,/repairEventBandFallbackColors\(document\.querySelector\('\.calendar-grid'\)\)/,'initial month must also repair EVENT fallback colors');
assert.match(sw,/familytodo-static-wave128-fix10/,'static cache must rotate for fix10');
assert.match(ci,/node scripts\/wave128-fix10-smoke\.mjs/,'fix10 smoke must run in CI');

console.log('wave128 fix10 smoke: multi-day EVENT fallback color parity ok');
