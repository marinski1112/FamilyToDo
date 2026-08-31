import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');
const createSource=fs.readFileSync('public/assets/shopping-new.js','utf8');

assert.match(source,/const safeEntityId=value=>\{const id=Number\(value\);return Number\.isSafeInteger\(id\)&&id>0\?id:0\}/,'Shopping client IDs must pass one positive safe-integer boundary');
assert.match(source,/const safeId=safeEntityId\(id\);if\(!safeId\)return/,'detail lookup must reject an invalid DOM entity ID before reading payload data');
assert.match(source,/const rowId=safeEntityId\(r\.id\);if\(!rowId\)return;selected=rowId/,'persisted detail IDs must be revalidated before mutation state is selected');
assert.match(source,/shopping_edit\.php\?id='\+encodeURIComponent\(rowId\)/,'edit navigation must use only a validated Shopping entity ID');
assert.match(source,/const taskId=safeEntityId\(d\.id\);if\(!taskId\)throw new Error/,'task conversion response IDs must be validated before navigation');
assert.match(source,/task\/view\.php\?id='\+taskId/,'task navigation must use the validated task ID');
assert.match(source,/const checked=el\.checked,id=safeEntityId\(el\.dataset\.id\);if\(!id\)\{el\.checked=!checked;return\}/,'toggle mutations must fail closed before network I/O when the DOM entity ID is invalid');
assert.match(source,/JSON\.stringify\(\{action:'toggle',id,completed:checked,csrf\}\)/,'toggle mutation must send only the validated ID while retaining CSRF');
assert.doesNotMatch(source,/JSON\.stringify\(\{action:'toggle',id:Number\(el\.dataset\.id\)/,'toggle mutation must not restore direct numeric coercion of DOM IDs');

assert.match(createSource,/const safeEntityId=value=>\{const id=Number\(value\);return Number\.isSafeInteger\(id\)&&id>0\?id:0\}/,'Shopping create references must use the same positive safe-integer boundary');
assert.match(createSource,/const rawTaskId=String\(fd\.get\('task_id'\)\?\?' '\)\.trim\(\)/,'placeholder');
assert.match(createSource,/const taskId=rawTaskId===''\|\|rawTaskId==='0'\?0:safeEntityId\(rawTaskId\)/,'optional task reference must preserve no-task zero while validating real task IDs');
assert.match(createSource,/if\(rawTaskId!==''&&rawTaskId!=='0'&&!taskId\)\{alert\('タスクの指定が不正です。'\);return;\}/,'invalid task references must fail before add_batch network I/O');
assert.match(createSource,/const assigneeValues=\[\.\.\.form\.querySelectorAll\('\[name="assignees"\]:checked'\)\]\.map\(x=>String\(x\.value\?\?' '\)\.trim\(\)\)/,'placeholder');
assert.match(createSource,/const assignees=assigneeValues\.map\(safeEntityId\);\s*if\(assignees\.some\(id=>!id\)\)\{alert\('担当者の指定が不正です。'\);return;\}/,'all assignee references must be positive safe integers before submission');
assert.match(createSource,/task_id:taskId,assignees,memo:/,'add_batch payload must use only validated task/member references');
assert.doesNotMatch(createSource,/task_id:Number\(fd\.get\('task_id'\)/,'Shopping create must not restore direct numeric coercion for task references');
assert.doesNotMatch(createSource,/assignees:\[\.\.\.form\.querySelectorAll[^\n]+\.map\(x=>Number\(x\.value\)\)/,'Shopping create must not restore direct numeric coercion for assignee references');

for(const [name,text] of [['Shopping list/detail',source],['Shopping create',createSource]]){
  assert.doesNotMatch(text,/cookie|authorization|token|member_name|family_name|private_owner_id/i,`${name} entity ID boundary must not add identity/session handling`);
}

console.log('shopping entity id safety contract: navigation, mutations, and create references accept only positive safe integer entity IDs');
