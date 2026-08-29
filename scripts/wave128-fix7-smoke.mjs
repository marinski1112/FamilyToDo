import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(pwa,/calendar-projection-status/,'Google Calendar projection status UI must exist');
assert.ok(pwa.includes('PENDING件数:\\s*(\\d+)'),'projection status must read existing pending diagnostics');
assert.ok(pwa.includes('ERROR件数:\\s*(\\d+)'),'projection status must read existing error diagnostics');
assert.match(pwa,/linked件数.*TASKとEVENTの両方/,'linked count must be described as mixed TASK/EVENT diagnostics');
assert.match(pwa,/calendar-backfill-limit/,'1000 item backfill limit warning must exist');
assert.match(pwa,/backfill.*1回1000件上限|1000件.*ページング対応/,'backfill warning must explain the current limit without freezing exact UI wording');
assert.match(sw,/familytodo-static-wave128-fix\d+/,'static cache must remain on the Wave128 safe-fix namespace');

console.log('wave128 fix7 smoke: Google Calendar read-only diagnostics and backfill limit warning ok');
