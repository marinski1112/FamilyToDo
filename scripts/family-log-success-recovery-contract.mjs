import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery=fs.readFileSync('public/assets/family-log-success-recovery.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');

assert.match(recovery,/MutationObserver/,'recovery must observe the canonical success feedback without owning the click/save path');
assert.match(recovery,/\.family-log-toast:not\(\.error\)/,'only successful quick-save feedback may trigger recovery');
assert.match(recovery,/queueMicrotask\(\(\)=>finish\(toast\)\)/,'recovery must run before a delayed render/timer window');
assert.ok(recovery.indexOf('familyLogDiagnostic?.reload()')<recovery.indexOf('location.reload()'),'diagnostics must mark reload before navigation');
assert.ok(!recovery.includes("fetch("),'recovery must never retry or duplicate the Family Log mutation');
assert.ok(!recovery.includes('/api/family-log'),'recovery must not own the canonical save endpoint');
assert.match(shell,/family-log-success-recovery\.js\?v=\$\{APP_VERSION\}-post-save1/,'Family Log page must cache-bust the recovery asset');
console.log('Family Log successful quick saves recover before the LIFF delayed-reload freeze window without retrying mutations');
