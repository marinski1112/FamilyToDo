import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/messages.js','utf8');
const messageNew=fs.readFileSync('public/assets/message-new.js','utf8');
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
assert.match(serviceWorker,/const STATIC_CACHE='familytodo-static-messages-error-display-privacy'/,'Messages privacy deployment must rotate the static cache so stale vulnerable assets are evicted');
assert.match(serviceWorker,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'static cache rotation must continue evicting superseded FamilyToDo caches');
assert.doesNotMatch(source+messageNew,/calendar_perf|CHILD_JOURNAL|CHILD_MILESTONE|OwnTracks|geofence/i,'Messages error hardening must remain isolated from deferred Calendar/Child Journal/location work');

console.log('messages action error display privacy contract: all posting/action routes use fixed browser-safe failures and stale vulnerable assets are evicted');
