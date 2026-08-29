import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.match(pwa,/wave128-auto-contrast/,'contrast guard class must exist');
assert.match(pwa,/contrastRatio/,'contrast guard must compute an actual contrast ratio');
assert.match(pwa,/bgLum<0\.35&&current<4\.5&&white>current/,'only low-contrast dark controls should be repaired');
assert.match(pwa,/classList\.contains\('gray'\)/,'gray buttons must be excluded');
assert.match(pwa,/classList\.contains\('secondary'\)/,'secondary buttons must be excluded');
assert.match(pwa,/classList\.contains\('danger'\)/,'danger buttons must be excluded');
assert.match(pwa,/MutationObserver/,'dynamically inserted controls must also be checked');
assert.match(sw,/familytodo-static-wave128-fix9/,'static cache must rotate for fix9');
assert.match(ci,/node scripts\/wave128-fix9-smoke\.mjs/,'fix9 smoke must run in CI');

console.log('wave128 fix9 smoke: computed interactive contrast guard ok');
