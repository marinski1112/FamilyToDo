import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const mobile=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.match(calendar,/calendar-mobile-ui\.js\?v=wave128-fix14/,'calendar must load the compact UI module');
assert.match(calendar,/monthLabel\.textContent=currentMonth\.slice\(0,4\)\+'年'\+Number\(currentMonth\.slice\(5\)\)\+'月'/,'month navigation must keep the compact year/month label without the old calendar heading arrow');
assert.match(mobile,/calendar-page-head h1\{display:none/,'calendar heading must be removed from the compact mobile chrome');
assert.match(mobile,/calendarFilterToggle/,'filter must use an explicit expandable control');
assert.match(mobile,/filter\.hidden=!opening/,'filter panel must collapse and expand without changing the current view');
assert.match(mobile,/\.wrap\{max-width:none!important;width:100%/,'calendar page must use the mobile viewport width');
assert.match(mobile,/calendar-grid \.calendar-item,body\.calendar-compact-ui \.calendar-grid \.calendar-band/,'task/event labels must receive the larger compact calendar typography');
assert.match(mobile,/font-size:10px!important/,'calendar task/event text must be materially larger than the previous 7px mobile rule');
assert.match(sw,/familytodo-static-wave128-fix14/,'fix14 must rotate the static cache');
assert.match(ci,/node scripts\/wave128-fix14-smoke\.mjs/,'fix14 smoke must run in CI');

console.log('wave128 fix14 smoke: full-width compact mobile calendar chrome and expandable filter ok');
