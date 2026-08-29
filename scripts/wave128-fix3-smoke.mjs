import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/calendar-item\.event-single:not\(\[style\*="background"\]\)/,'EVENT without explicit color must get display-only green fallback');
assert.match(pwa,/background:#16a34a/,'EVENT fallback must use green');
assert.match(pwa,/calendar-projection-safety/,'Google Calendar safety guidance must be present');
assert.match(pwa,/現在Family TODOと連携中の「Family TODO」カレンダーは削除しないでください/,'guidance must protect the active projection calendar');
assert.match(pwa,/旧ICSを直接取り込んだ別サブカレンダーだけを削除してください/,'guidance must distinguish the legacy ICS calendar');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must use the Wave128 safe-fix namespace');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the pre-Wave128 namespace');

console.log('wave128 fix3 smoke: event fallback, Google Calendar safety guidance, semantic cache contract ok');
