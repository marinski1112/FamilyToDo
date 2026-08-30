import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/calendar-item\.event-single:not\(\[style\*="background"\]\)/,'EVENT without explicit color must get display-only green fallback');
assert.match(pwa,/background:#16a34a/,'EVENT fallback must use green');
assert.match(pwa,/calendar-projection-safety/,'Google Calendar safety guidance must be present');
assert.match(pwa,/現在Family TODOと連携中の「Family TODO」カレンダーは削除しないでください/,'guidance must protect the active projection calendar');
assert.match(pwa,/旧ICSを直接取り込んだ別サブカレンダーだけを削除してください/,'guidance must distinguish the legacy ICS calendar');
assert.match(pwa,/calendar-projection-status/,'Google Calendar projection status UI must exist');
assert.ok(pwa.includes('PENDING件数:\\s*(\\d+)'),'projection status must read existing pending diagnostics');
assert.ok(pwa.includes('ERROR件数:\\s*(\\d+)'),'projection status must read existing error diagnostics');
assert.match(pwa,/linked件数.*TASKとEVENTの両方/,'linked count must be described as mixed TASK/EVENT diagnostics');
assert.match(pwa,/calendar-backfill-limit/,'1000 item backfill limit warning must exist');
assert.match(pwa,/backfill.*1回1000件上限|1000件.*ページング対応/,'backfill warning must explain the current limit without freezing exact UI wording');
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must stay in the FamilyToDo static-cache namespace');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the pre-Wave128 namespace');

console.log('calendar-projection-ui-contract: event fallback, projection safety, diagnostics, backfill warning, and cache contract ok');
