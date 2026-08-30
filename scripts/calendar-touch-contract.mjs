import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/\.calendar-grid a\[href\]/,'Calendar touch guard must target interactive links inside the grid');
assert.match(pwa,/touchstart/,'Calendar touch guard must track touch start');
assert.match(pwa,/touchend/,'Calendar touch guard must handle touch end');
assert.match(pwa,/capture:true,passive:false/,'touch-end interception must run before the Calendar cell handler and allow preventDefault');
assert.match(pwa,/Math\.abs\(dx\)>=28\|\|Math\.abs\(dy\)>=28/,'swipes must not be converted into link taps');
assert.match(pwa,/stopImmediatePropagation\(\)/,'a real link tap must not also open the Calendar day modal');
assert.match(pwa,/location\.href=link\.href/,'a real link tap must navigate to the repaired task or recurring URL');

assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO namespace so touch fixes reach cached clients');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the obsolete pre-Wave128 namespace');

console.log('calendar-touch contract: link taps and swipe isolation ok');
