import assert from 'node:assert/strict';
import fs from 'node:fs';

const createSource=fs.readFileSync('public/assets/shopping-new.js','utf8');

assert.match(createSource,/const safeEntityId=value=>\{const id=Number\(value\);return Number\.isSafeInteger\(id\)&&id>0\?id:0\}/,'Shopping create references must use a positive safe-integer boundary');
assert.match(createSource,/const rawTaskId=String\(fd\.get\('task_id'\)\?\?''\)\.trim\(\)/,'task reference must be normalized before validation');
assert.match(createSource,/const taskId=rawTaskId===''\|\|rawTaskId==='0'\?0:safeEntityId\(rawTaskId\)/,'optional task reference must preserve no-task zero while validating real task IDs');
assert.match(createSource,/if\(rawTaskId!==''&&rawTaskId!=='0'&&!taskId\)\{alert\('タスクの指定が不正です。'\);return;\}/,'invalid task references must fail before add_batch network I/O');
assert.match(createSource,/const assigneeValues=\[\.\.\.form\.querySelectorAll\('\[name="assignees"\]:checked'\)\]\.map\(x=>String\(x\.value\?\?''\)\.trim\(\)\)/,'assignee references must be normalized before validation');
assert.match(createSource,/const assignees=assigneeValues\.map\(safeEntityId\);\s*if\(assignees\.some\(id=>!id\)\)\{alert\('担当者の指定が不正です。'\);return;\}/,'all assignee references must be positive safe integers before submission');
assert.match(createSource,/task_id:taskId,assignees,memo:/,'add_batch payload must use only validated task/member references');
assert.doesNotMatch(createSource,/task_id:Number\(fd\.get\('task_id'\)/,'Shopping create must not restore direct numeric coercion for task references');
assert.doesNotMatch(createSource,/assignees:\[\.\.\.form\.querySelectorAll[^\n]+\.map\(x=>Number\(x\.value\)\)/,'Shopping create must not restore direct numeric coercion for assignee references');
assert.doesNotMatch(createSource,/cookie|authorization|token|member_name|family_name|private_owner_id/i,'Shopping create entity ID boundary must not add identity/session handling');

console.log('shopping entity id safety contract: active create references accept only positive safe integer entity IDs');
