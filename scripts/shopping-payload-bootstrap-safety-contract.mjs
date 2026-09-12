import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping-new.js','utf8');

assert.match(source,/const payloadNode=document\.getElementById\('shoppingNewPayload'\)/,'Shopping create must own an explicit payload bootstrap node');
assert.match(source,/let payload=\{\};\s*try\{payload=JSON\.parse\(payloadNode\?\.textContent\|\|'\{\}'\);\}catch\{payload=\{\};\}/,'Shopping create payload bootstrap must catch malformed JSON and fall back to an empty non-sensitive config');
assert.match(source,/const csrf=String\(payload\.csrf\|\|''\)/,'Shopping create CSRF consumer must derive from the safely parsed payload only');
assert.match(source,/if\(!csrf\|\|csrf\.length>MAX_CSRF_UNITS\)\{alert\('追加に失敗しました。ページを再読み込みしてください。'\);return;\}/,'missing or oversized CSRF payload must fail closed before network I/O');
assert.doesNotMatch(source,/console\.(?:log|warn|error)\([^\n]*(?:shoppingNewPayload|payload|csrf)/i,'payload bootstrap must not log persisted Shopping payload or CSRF values');
assert.doesNotMatch(source,/dataset\.shoppingNewJs\s*=\s*(?:payload|csrf)/,'diagnostic dataset state must never contain parsed private payload data');
assert.match(source,/const r=await fetch\('\/api\/shopping',[\s\S]*?r\.json\(\)\.catch\(\(\)=>null\);if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('追加に失敗しました。'\)/,'Shopping create submission must fail closed on malformed responses and server failures');
assert.doesNotMatch(source,/calendar_perf|\/app\/calendar\.php|CALENDAR_PERF_DIAGNOSTICS/,'Shopping create payload hardening must remain isolated from Calendar diagnostics');

console.log('shopping payload bootstrap safety contract: active create payload and CSRF bootstrap fail closed without logging private payload data');
