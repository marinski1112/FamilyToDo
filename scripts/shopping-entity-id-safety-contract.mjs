import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');

assert.match(source,/const safeEntityId=value=>\{const id=Number\(value\);return Number\.isSafeInteger\(id\)&&id>0\?id:0\}/,'Shopping client IDs must pass one positive safe-integer boundary');
assert.match(source,/const safeId=safeEntityId\(id\);if\(!safeId\)return/,'detail lookup must reject an invalid DOM entity ID before reading payload data');
assert.match(source,/const rowId=safeEntityId\(r\.id\);if\(!rowId\)return;selected=rowId/,'persisted detail IDs must be revalidated before mutation state is selected');
assert.match(source,/shopping_edit\.php\?id='\+encodeURIComponent\(rowId\)/,'edit navigation must use only a validated Shopping entity ID');
assert.match(source,/const taskId=safeEntityId\(d\.id\);if\(!taskId\)throw new Error/,'task conversion response IDs must be validated before navigation');
assert.match(source,/task\/view\.php\?id='\+taskId/,'task navigation must use the validated task ID');
assert.match(source,/const checked=el\.checked,id=safeEntityId\(el\.dataset\.id\);if\(!id\)\{el\.checked=!checked;return\}/,'toggle mutations must fail closed before network I/O when the DOM entity ID is invalid');
assert.match(source,/JSON\.stringify\(\{action:'toggle',id,completed:checked,csrf\}\)/,'toggle mutation must send only the validated ID while retaining CSRF');
assert.doesNotMatch(source,/JSON\.stringify\(\{action:'toggle',id:Number\(el\.dataset\.id\)/,'toggle mutation must not restore direct numeric coercion of DOM IDs');
assert.doesNotMatch(source,/console\.(?:log|warn|error)|cookie|authorization|token|member_name|family_name|private_owner_id/i,'Shopping entity ID boundary must not add sensitive logging or identity/session handling');

console.log('shopping entity id safety contract: navigation and mutations accept only positive safe integer entity IDs');
