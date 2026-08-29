import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobile=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(mobile,/calendar-filter-toggle svg/,'filter control must be icon-sized rather than text-sized');
assert.ok(mobile.includes("setAttribute('aria-label','表示フィルター')"),'filter icon must retain an accessible label');
assert.ok(mobile.includes('calendar-overflow-hidden'),'normal month view must support an explicit hidden-row marker');
assert.ok(mobile.includes('bandsForCell')&&mobile.includes('singleSlots'),'month row cap must count spanning bands and ordinary rows together by date');
assert.ok(mobile.includes('setOverflowHidden(band,bandLane(band)>2)'),'band lanes beyond the visible two-row budget must be hidden');
assert.match(mobile,/text-overflow:clip!important/,'calendar labels must clip rather than render ellipsis');
assert.ok(mobile.includes("replace(/^\\s*📌\\s*/,''"),'event pin prefix must be removed from month labels');
assert.match(mobile,/calendar-press-popover/,'press preview must remain available as a temporary floating view');
assert.ok(mobile.includes('schedulesForCell(cell)'),'press preview must include spanning bands and hidden rows for the pressed date');
assert.ok(mobile.includes("removeAttribute('href')"),'mobile schedule labels must not navigate when used as press-preview targets');
assert.ok(mobile.includes("document.addEventListener('touchend'"),'touch release must restore the compact view');
assert.ok(mobile.includes("document.addEventListener('click'"),'schedule click must be intercepted so date/blank click remains the day-detail path');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'Calendar safe fixes must stay within the Wave128 static cache namespace');
assert.ok(ci.includes('node scripts/regression-suite.mjs'),'CI must invoke the consolidated regression suite');
assert.ok(runner.includes('wave128-fix${n}-smoke.mjs')&&/\b15\b/.test(runner),'fix15 smoke must be included in the consolidated fix runner');

console.log('wave128 fix15 smoke: mixed two-row cap, compact clipping, icon filter, press-to-preview interaction ok');
