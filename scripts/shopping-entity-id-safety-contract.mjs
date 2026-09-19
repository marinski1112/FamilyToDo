import assert from 'node:assert/strict';
import fs from 'node:fs';

const createSource=fs.readFileSync('public/assets/shopping-new.js','utf8');

assert.doesNotMatch(createSource,/\btask_id\b|\btaskId\b|\brawTaskId\b/,'Shopping create must not expose or submit a task relation');
assert.doesNotMatch(createSource,/\bassignees?\b|\[name="assignees"\]/,'Shopping create must not expose or submit assignees');
assert.match(createSource,/const body=\{action:'add_batch',csrf,products:[\s\S]*?category,due_date:dueDate,memo:memo\};/,'add_batch payload must contain only independent Shopping fields');
assert.doesNotMatch(createSource,/cookie|authorization|token|member_name|family_name|private_owner_id/i,'Shopping create entity ID boundary must not add identity/session handling');

console.log('shopping entity id safety contract: Shopping create has no task or assignee linkage transport');
