import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/\.calendar-grid a\[href\]/,'calendar touch guard targets interactive links inside the grid');
assert.match(pwa,/touchstart/,'calendar touch guard tracks touch start');
assert.match(pwa,/touchend/,'calendar touch guard handles touch end');
assert.match(pwa,/capture:true,passive:false/,'touch-end interception runs before the calendar cell handler and can prevent default');
assert.match(pwa,/Math\.abs\(dx\)>=28\|\|Math\.abs\(dy\)>=28/,'swipes are not converted into link taps');
assert.match(pwa,/stopImmediatePropagation\(\)/,'tap prevents the calendar-cell touch handler from also opening the day modal');
assert.match(pwa,/location\.href=link\.href/,'a real link tap navigates to the repaired task or recurring URL');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must remain on the Wave128 safe-fix namespace so the touch fix reaches iPhone and LINE WebView clients');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the pre-Wave128 namespace');

console.log('wave128 fix6 smoke: ok');
