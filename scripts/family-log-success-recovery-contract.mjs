import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery=fs.readFileSync('public/assets/family-log-success-recovery.js','utf8');
const compact=fs.readFileSync('public/assets/family-log-compact-ui.js','utf8');
const loader=fs.readFileSync('public/assets/family-log.js','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');

assert.match(recovery,/MutationObserver/,'recovery must observe the canonical success feedback without owning the click/save path');
assert.match(recovery,/\.family-log-toast:not\(\.error\)/,'only successful quick-save feedback may trigger recovery');
assert.match(recovery,/queueMicrotask\(\(\)=>finish\(toast\)\)/,'recovery must run before a delayed render/timer window');
assert.ok(recovery.indexOf('familyLogDiagnostic?.reload()')<recovery.indexOf('location.reload()'),'diagnostics must mark reload before navigation');
assert.ok(!recovery.includes("fetch("),'recovery must never retry or duplicate the Family Log mutation');
assert.ok(!recovery.includes('/api/family-log'),'recovery must not own the canonical save endpoint');
assert.match(shell,/family-log-success-recovery\.js\?v=\$\{APP_VERSION\}-post-save1/,'Family Log page must cache-bust the recovery asset');

assert.match(compact,/const choreLabelText='名前（1〜6文字）'/,'compact enhancer must use a stable target label');
assert.match(compact,/choreLabel\.textContent!==choreLabelText/,'MutationObserver callback must not rewrite an already-normalized label');
assert.match(compact,/const choreHelpText='6文字以内で設定してください。既存の長い名前は自動で切断しません。'/,'compact enhancer must use a stable target help string');
assert.match(compact,/choreHelp\.textContent!==choreHelpText/,'MutationObserver callback must not rewrite already-normalized help text');
assert.doesNotMatch(compact,/choreLabel\.textContent\?\.includes\('名前'\)\)choreLabel\.textContent='名前（1〜6文字）'/,'body observer must not self-trigger by unconditionally replacing the same label text node');
assert.doesNotMatch(compact,/choreHelp\.matches\('p\.small'\)\)choreHelp\.textContent='6文字以内で設定してください。既存の長い名前は自動で切断しません。'/,'body observer must not self-trigger by unconditionally replacing the same help text node');
assert.match(loader,/location\.pathname==='\/app\/settings_family_log\.php'\)load\('\/assets\/family-log-management-ui\.js\?v=wave128-fix18'\);\s*else load\('\/assets\/family-log-compact-ui\.js\?v=compact3'\)/,'daily Family Log must load the fixed compact enhancer directly instead of routing through the management enhancer');
assert.match(shell,/const FAMILY_LOG_UI_REVISION = 'baby-food-photo2-observer1-form2'/,'Family Log loader must be cache-busted for the observer fix');

console.log('Family Log successful quick saves can leave UI_UPDATE_DONE without entering a self-sustaining compact MutationObserver microtask loop');
