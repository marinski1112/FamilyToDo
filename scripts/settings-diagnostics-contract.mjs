import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.ts','utf8');
for(const marker of [
  'Promise.allSettled',
  '⚠️ この診断を実行できませんでした',
  '/api/settings/diagnostics-detail?issue=',
  '初期ロード ${DIAGNOSTIC_DEFINITIONS.length} query',
]) assert.ok(app.includes(marker),marker);

const start=app.indexOf('const DIAGNOSTIC_DEFINITIONS');
const end=app.indexOf('export async function inviteCreate');
assert.ok(start>=0&&end>start,'settings diagnostics source block must remain locatable');
const diagnostic=app.slice(start,end);
assert.doesNotMatch(diagnostic,/\bUNION(?:\s+ALL)?\b/i,'settings diagnostics must avoid compound SELECT fan-out');

console.log('settings-diagnostics-contract: concurrent diagnostic loading, detail fallback, and non-compound query contract ok');
