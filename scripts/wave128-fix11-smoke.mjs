import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');

assert.match(pwa,/対象EVENT件数:\\s\*\(\\d\+\)/,'preflight must read the uncapped server EVENT count');
assert.match(pwa,/linked件数:\\s\*\(\\d\+\)/,'preflight must show the existing active link total without treating it as EVENT-only');
assert.match(pwa,/eventTargets>1000/,'history warning must use the uncapped EVENT total, not preview count alone');
assert.match(pwa,/const overflow=eventTargets-1000/,'preflight must report the minimum overflow beyond one backfill run');
assert.match(pwa,/全履歴backfillは1回1000件上限/,'warning must explain the server backfill limit');
assert.match(pwa,/linked件数にはTASKとEVENTの両方が含まれる/,'UI must not claim link total equals EVENT coverage');
assert.match(pwa,/eventTargets===0&&previewCount>=1000/,'preview count is only a fallback when the server total cannot be read');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must remain on the Wave128 safe-fix namespace');
assert.ok(runner.includes('wave128-fix${n}-smoke.mjs')&&/\b11\b/.test(runner),'fix11 smoke must run through the consolidated regression suite');

console.log('wave128 fix11 smoke: Google Calendar read-only history preflight ok');
