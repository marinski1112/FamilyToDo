import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/\.bottom-nav \.nav-inner>a\{white-space:nowrap!important/,'bottom navigation labels must not wrap on mobile');
assert.match(pwa,/word-break:keep-all!important/,'Japanese navigation labels must stay intact');
assert.match(pwa,/a\[href="\/app\/tasks\.php"\]\{font-size:8px!important;letter-spacing:-\.06em!important\}/,'long task/event label must fit the six-column mobile nav');
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO static namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire older Family TODO static caches');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the pre-Wave128 namespace');

console.log('wave128 fix8 smoke: mobile bottom navigation nowrap compatibility ok');
