import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobile=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(mobile,/calendar-filter-toggle svg/,'filter control must be icon-sized rather than text-sized');
assert.ok(mobile.includes("setAttribute('aria-label','表示フィルター')"),'filter icon must retain an accessible label');
assert.match(mobile,/calendar-items>\*:nth-child\(n\+3\):not\(\.calendar-overflow-indicator\)\{display:none!important\}/,'normal month view must cap visible schedule rows at two while keeping the overflow indicator visible');
assert.match(mobile,/text-overflow:clip!important/,'calendar labels must clip rather than render ellipsis');
assert.ok(mobile.includes("replace(/^\\s*📌\\s*/,''"),'event pin prefix must be removed from month labels');
assert.match(mobile,/calendar-press-popover/,'press preview must remain available as a temporary floating view');
assert.match(mobile,/querySelectorAll\('\.calendar-item,\.calendar-band'\)/,'press preview must include all hidden schedule rows from the date');
assert.ok(mobile.includes("removeAttribute('href')"),'mobile schedule labels must not navigate when used as press-preview targets');
assert.ok(mobile.includes("document.addEventListener('touchend'"),'touch release must restore the compact view');
assert.ok(mobile.includes("document.addEventListener('click'"),'schedule click must be intercepted so date/blank click remains the day-detail path');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'Calendar safe fixes must stay within the Wave128 static cache namespace');
assert.ok(ci.includes('node scripts/regression-suite.mjs')&&runner.includes('wave128-fix15-smoke.mjs'),'fix15 smoke must run through the consolidated CI regression suite');

console.log('wave128 fix15 smoke: compact clipping, overflow indicator, icon filter, press-to-preview calendar interaction ok');
