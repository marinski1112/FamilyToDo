import assert from 'node:assert/strict';
import fs from 'node:fs';

const taskNew=fs.readFileSync('public/assets/task-new.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const serviceWorker=fs.readFileSync('public/sw.js','utf8');

for(const [name,asset,fixedText] of [
  ['task create',taskNew,'登録に失敗しました'],
  ['task edit',taskEdit,'更新に失敗しました'],
]){
  assert.ok(asset.includes(`alert('${fixedText}')`)||asset.includes(`new Error('${fixedText}')`),`${name} must retain fixed browser-safe failure text`);
  assert.doesNotMatch(asset,/new Error\(d\?\.error|new Error\(d\.error|alert\(d\?\.error|alert\(d\.error/,`${name} must not surface arbitrary server error detail`);
  assert.doesNotMatch(asset,/alert\([^\n]*(?:err|error|e)\?*\.message|alert\([^\n]*String\((?:err|error|e)\)/,`${name} must not surface raw exception messages or objects`);
  assert.doesNotMatch(asset,/console\.(?:log|warn|error)\(/,`${name} must not log task/shopping payloads or exception detail`);
}

assert.match(taskNew,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('登録に失敗しました'\)/,'task create must fail closed on HTTP/API/non-JSON responses');
assert.match(taskNew,/catch\(_err\)\{alert\('登録に失敗しました'\)/,'task create transport failures must use fixed browser-safe text');
assert.match(taskEdit,/if\(!r\.ok\|\|d\?\.error\)throw new Error\('更新に失敗しました'\)/,'task edit must fail closed on HTTP/API error responses');
assert.match(taskEdit,/catch\(_err\)\{alert\('更新に失敗しました'\)/,'task edit transport failures must use fixed browser-safe text');
assert.match(serviceWorker,/const STATIC_CACHE='familytodo-static-task-error-display-privacy'/,'Task privacy deployment must rotate the static cache so stale vulnerable assets are evicted');
assert.match(serviceWorker,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'static cache rotation must continue evicting superseded FamilyToDo caches');
assert.doesNotMatch(taskNew+taskEdit,/calendar_perf|CHILD_JOURNAL|CHILD_MILESTONE|OwnTracks|geofence/i,'Task/Shopping error hardening must remain isolated from deferred Calendar/Child Journal/location work');

console.log('task shopping error display privacy contract: create/edit use fixed browser-safe failures and stale vulnerable assets are evicted');
