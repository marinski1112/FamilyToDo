import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const mobile=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(calendar,/calendar-mobile-ui\.js\?v=wave128-fix14/,'calendar must load the compact UI module');
assert.match(calendar,/monthLabel\.textContent=currentMonth\.slice\(0,4\)\+'年'\+Number\(currentMonth\.slice\(5\)\)\+'月'/,'month navigation must keep the compact year/month label without the old calendar heading arrow');
assert.match(mobile,/calendar-page-head h1\{display:none/,'calendar heading must be removed from the compact mobile chrome');
assert.match(mobile,/calendarFilterToggle/,'filter must use an explicit expandable control');
assert.match(mobile,/filter\.hidden=!opening/,'filter panel must collapse and expand without changing the current view');
assert.match(mobile,/\.wrap\{max-width:none!important;width:100%/,'calendar page must use the mobile viewport width');
assert.match(mobile,/calendar-grid \.calendar-item,body\.calendar-compact-ui \.calendar-grid \.calendar-band/,'task/event labels must receive the compact calendar typography');
assert.match(mobile,/font-size:10px!important/,'calendar task/event text must remain materially larger than the old 7px mobile rule');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must remain in the Wave128 safe-fix namespace');
assert.doesNotMatch(sw,/familytodo-static-v92/,'legacy cache namespace must not return');
assert.ok(runner.includes('wave128-fix${n}-smoke.mjs')&&/\b14\b/.test(runner),'fix14 smoke must run through the consolidated regression suite');

console.log('wave128 fix14 smoke: full-width compact mobile calendar chrome and expandable filter ok');
