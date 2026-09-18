import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/messages.js','utf8');
const messageNew=fs.readFileSync('public/assets/message-new.js','utf8');
const photoUpload=fs.readFileSync('public/assets/message-photo-upload.js','utf8');
const messageAiUi=fs.readFileSync('public/assets/messages-ai-ui.js','utf8');
const serviceWorker=fs.readFileSync('public/sw.js','utf8');

for(const message of ['投稿できませんでした。','買い物に追加できませんでした。','タスクに追加できませんでした。','削除に失敗しました','編集に失敗しました']){
  assert.ok(source.includes(`alert('${message}')`)||source.includes(`new Error('${message}')`),`Messages UI must retain fixed failure text for: ${message}`);
}

for(const [name,asset] of [['messages list',source],['message new',messageNew]]){
  assert.doesNotMatch(asset,/new Error\(d\?\.error|new Error\(d\.error|alert\(d\?\.error|alert\(d\.error/,`${name} must not surface arbitrary server error detail`);
  assert.doesNotMatch(asset,/alert\([^\n]*(?:err|error|e)\?*\.message|alert\([^\n]*String\((?:err|error|e)\)/,`${name} must not surface raw exception messages or objects`);
  assert.doesNotMatch(asset,/console\.(?:log|warn|error)\(/,`${name} must not log private message/task/shopping payloads or exception detail`);
}

assert.match(messageNew,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('投稿できませんでした。'\)/,'dedicated message posting must fail closed on HTTP/API/non-JSON responses');
assert.match(messageNew,/catch\([^)]*\)\{alert\('投稿できませんでした。'\)/,'dedicated message posting transport failures must use fixed browser-safe text');
assert.match(source,/taskStatus\.textContent='';alert\('タスクに追加できませんでした。'\)/,'task conversion transport/server failures must use fixed browser-safe text');
assert.match(source,/shoppingStatus\.textContent='';alert\('買い物に追加できませんでした。'\)/,'shopping conversion transport/server failures must use fixed browser-safe text');
assert.match(source,/editStatus\.textContent='';alert\('編集に失敗しました'\)/,'message edit transport/server failures must use fixed browser-safe text');
assert.match(photoUpload,/status\.hidden=!selected&&!status\.textContent/,'photo draft state must keep a fixed validation message visible even when an invalid selection is cleared');
assert.match(photoUpload,/元画像は20 MiB以内を選んでください。/,'oversize photo validation must retain its fixed browser-safe guidance');
assert.match(serviceWorker,/const STATIC_CACHE='familytodo-static-shopping-task-fallback'/,'Messages privacy fix must remain covered by the current static cache generation so stale vulnerable assets are evicted');
assert.match(serviceWorker,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'static cache rotation must continue evicting superseded FamilyToDo caches');
assert.doesNotMatch(source+messageNew,/calendar_perf|CHILD_JOURNAL|CHILD_MILESTONE|OwnTracks|geofence/i,'Messages error hardening must remain isolated from deferred Calendar/Child Journal/location work');

for(const marker of [
  "enhanceSecondaryModal('messageShoppingModal','.message-shopping-dialog','.convert-shopping','messageShoppingClose','伝言を買い物に追加')",
  "enhanceSecondaryModal('messageEditModal','.message-edit-dialog','.edit-message','messageEditClose','伝言を編集')",
  "dialog.setAttribute('role','dialog')",
  "dialog.setAttribute('aria-modal','true')",
  "if(event.key==='Escape'){event.preventDefault();close.click();return;}",
  "if(event.key!=='Tab')return;",
  "if(wasOpen&&!open){const target=returnFocus;returnFocus=null;requestAnimationFrame(()=>{if(target?.isConnected)target.focus();});}",
])assert.ok(messageAiUi.includes(marker),`secondary Messages modal accessibility marker missing: ${marker}`);
assert.match(messageAiUi,/document\.addEventListener\('click',event=>\{const opener=event\.target\?\.closest\?\.\(openerSelector\);if\(opener\)returnFocus=opener;\},true\)/,'secondary Messages modal opener focus capture must run before the existing bubbling open handler');
assert.match(messageAiUi,/const controls=\[\.\.\.dialog\.querySelectorAll\('button,input,select,textarea,summary,a\[href\]'\)\]\.filter\(el=>!el\.disabled&&el\.getClientRects\(\)\.length\)/,'secondary Messages modals must trap Tab within currently visible controls');

console.log('messages action error display privacy contract: all posting/action routes use fixed browser-safe failures, secondary modals retain keyboard focus, and stale vulnerable assets are evicted');
