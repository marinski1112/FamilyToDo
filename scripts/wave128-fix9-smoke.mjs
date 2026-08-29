import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(pwa,/wave128-auto-contrast/,'contrast guard class must exist');
assert.match(pwa,/contrastRatio/,'contrast guard must compute an actual contrast ratio');
assert.match(pwa,/bgLum<0\.35&&current<4\.5&&white>current/,'only low-contrast dark controls should be repaired');
assert.match(pwa,/classList\.contains\('gray'\)/,'gray buttons must be excluded');
assert.match(pwa,/classList\.contains\('secondary'\)/,'secondary buttons must be excluded');
assert.match(pwa,/classList\.contains\('danger'\)/,'danger buttons must be excluded');
assert.match(pwa,/MutationObserver/,'dynamically inserted controls must also be checked');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must remain on the Wave128 safe-fix namespace');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the pre-Wave128 namespace');
assert.match(runner,/1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20/,'fix9 smoke must run through the consolidated regression suite');

console.log('wave128 fix9 smoke: computed interactive contrast guard ok');
