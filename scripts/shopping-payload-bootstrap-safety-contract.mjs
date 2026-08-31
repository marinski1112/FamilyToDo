import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');

assert.match(source,/const root=document\.documentElement,payloadNode=document\.getElementById\('shoppingPayload'\);let cfg=\{\};try\{cfg=JSON\.parse\(payloadNode\?\.textContent\|\|'\{\}'\);root\.dataset\.shoppingJs='ready'\}catch\{cfg=\{\};root\.dataset\.shoppingJs='payload-error'\}/,'Shopping payload bootstrap must catch malformed JSON and fall back to an empty non-sensitive config');
assert.match(source,/const detail=cfg\.shoppingDetail\|\|\{\},csrf=String\(cfg\.csrf\|\|''\)/,'Shopping detail and CSRF consumers must derive from the safely parsed config only');
assert.doesNotMatch(source,/console\.(?:log|warn|error)\([^\n]*(?:shoppingPayload|cfg|csrf|detail)/i,'payload bootstrap must not log persisted Shopping content or CSRF values');
assert.doesNotMatch(source,/dataset\.shoppingJs\s*=\s*(?:cfg|detail|csrf)/,'diagnostic dataset state must never contain parsed private payload data');
assert.match(source,/alert\(e instanceof Error\?e\.message:'タスク化に失敗しました'\)/,'task conversion errors must remain bounded when a non-Error is thrown');
assert.match(source,/alert\(e instanceof Error\?e\.message:'更新に失敗しました'\)/,'toggle errors must remain bounded when a non-Error is thrown');

console.log('shopping payload bootstrap safety contract: malformed payload fails closed without logging private data');
