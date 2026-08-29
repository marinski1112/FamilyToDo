import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/wave128-auto-contrast/,'contrast guard class must exist');
assert.match(pwa,/contrastRatio/,'contrast guard must compute an actual contrast ratio');
assert.match(pwa,/bgLum<0\.35&&current<4\.5&&white>current/,'only low-contrast dark controls should be repaired');
assert.match(pwa,/classList\.contains\('gray'\)/,'gray buttons must be excluded');
assert.match(pwa,/classList\.contains\('secondary'\)/,'secondary buttons must be excluded');
assert.match(pwa,/classList\.contains\('danger'\)/,'danger buttons must be excluded');
assert.match(pwa,/MutationObserver/,'dynamically inserted controls must also be checked');
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO static namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire older Family TODO static caches');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the old namespace');

console.log('UI contract: computed interactive contrast guard ok');
