import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/messages.js','utf8');

for(const message of ['投稿できませんでした。','買い物に追加できませんでした。','タスクに追加できませんでした。','削除に失敗しました','編集に失敗しました']){
  assert.ok(source.includes(`alert('${message}')`)||source.includes(`new Error('${message}')`),`Messages UI must retain fixed failure text for: ${message}`);
}

assert.doesNotMatch(source,/new Error\(d\?\.error|new Error\(d\.error|alert\(d\?\.error|alert\(d\.error/,'Messages UI must not surface arbitrary server error detail');
assert.doesNotMatch(source,/alert\([^\n]*(?:err|error|e)\?*\.message|alert\([^\n]*String\((?:err|error|e)\)/,'Messages UI must not surface raw exception messages or objects');
assert.doesNotMatch(source,/console\.(?:log|warn|error)\(/,'Messages browser actions must not log private message/task/shopping payloads or exception detail');
assert.match(source,/taskStatus\.textContent='';alert\('タスクに追加できませんでした。'\)/,'task conversion transport/server failures must use fixed browser-safe text');
assert.match(source,/shoppingStatus\.textContent='';alert\('買い物に追加できませんでした。'\)/,'shopping conversion transport/server failures must use fixed browser-safe text');
assert.match(source,/editStatus\.textContent='';alert\('編集に失敗しました'\)/,'message edit transport/server failures must use fixed browser-safe text');
assert.doesNotMatch(source,/calendar_perf|CHILD_JOURNAL|CHILD_MILESTONE|OwnTracks|geofence/i,'Messages error hardening must remain isolated from deferred Calendar/Child Journal/location work');

console.log('messages action error display privacy contract: server and transport failures stay on fixed browser-safe messages without raw detail');
