import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');

assert.match(source,/const root=document\.documentElement,payloadNode=document\.getElementById\('shoppingPayload'\);let cfg=\{\};try\{cfg=JSON\.parse\(payloadNode\?\.textContent\|\|'\{\}'\);root\.dataset\.shoppingJs='ready'\}catch\{cfg=\{\};root\.dataset\.shoppingJs='payload-error'\}/,'Shopping payload bootstrap must catch malformed JSON and fall back to an empty non-sensitive config');
assert.match(source,/const detail=cfg\.shoppingDetail\|\|\{\},csrf=String\(cfg\.csrf\|\|''\)/,'Shopping detail and CSRF consumers must derive from the safely parsed config only');
assert.doesNotMatch(source,/console\.(?:log|warn|error)\([^\n]*(?:shoppingPayload|cfg|csrf|detail)/i,'payload bootstrap must not log persisted Shopping content or CSRF values');
assert.doesNotMatch(source,/dataset\.shoppingJs\s*=\s*(?:cfg|detail|csrf)/,'diagnostic dataset state must never contain parsed private payload data');
assert.match(source,/action:'to_task'[\s\S]*?r\.json\(\)\.catch\(\(\)=>null\)[\s\S]*?if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('タスク化に失敗しました'\)[\s\S]*?catch\{alert\('タスク化に失敗しました'\)\}/,'task conversion must use a fixed browser-safe failure message for malformed responses, server failures, and transport exceptions');
assert.match(source,/action:'toggle'[\s\S]*?r\.json\(\)\.catch\(\(\)=>null\)[\s\S]*?if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('更新に失敗しました'\)[\s\S]*?catch\{el\.checked=!checked;alert\('更新に失敗しました'\)\}/,'toggle must restore UI state and use a fixed browser-safe failure message for malformed responses, server failures, and transport exceptions');
assert.doesNotMatch(source,/new Error\(d\?\.error|new Error\(d\.error|alert\(d\?\.error|alert\(d\.error|alert\(e\.message|alert\(e instanceof Error\?e\.message/,'Shopping action UI must not surface arbitrary server or exception detail in the browser');
assert.doesNotMatch(source,/calendar_perf|\/app\/calendar\.php|CALENDAR_PERF_DIAGNOSTICS/,'Shopping action error hardening must remain isolated from Calendar diagnostics');

console.log('shopping payload bootstrap safety contract: malformed payload and Shopping action failures fail closed without logging or surfacing private/server detail');
