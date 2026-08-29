import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/\.bottom-nav \.nav-inner>a\{white-space:nowrap!important/,'bottom navigation labels must not wrap on mobile');
assert.match(pwa,/word-break:keep-all!important/,'Japanese navigation labels must stay intact');
assert.match(pwa,/a\[href="\/app\/tasks\.php"\]\{font-size:8px!important;letter-spacing:-\.06em!important\}/,'long task/event label must fit the six-column mobile nav');
assert.match(sw,/familytodo-static-wave128-fix8/,'static cache must rotate for fix8');

console.log('wave128 fix8 smoke: mobile bottom navigation nowrap compatibility ok');
