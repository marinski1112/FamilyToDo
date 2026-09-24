import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/google-tasks.ts','utf8');

const taskBlock=source.slice(source.indexOf("if(command.type==='TASK_COMPLETE')"),source.indexOf("if(command.type==='SHOPPING_COMPLETE')"));
assert.ok(taskBlock.length>0,'TASK_COMPLETE handler must exist');
for(const value of [
  't.family_id=?',
  "COALESCE(t.task_kind,'TASK')<>'EVENT'",
  "COALESCE(t.visibility_scope,'FAMILY')='FAMILY'",
  't.private_owner_id=?',
  'TASK_NOT_FOUND_OR_PRIVATE',
  'AMBIGUOUS_TASK',
  "WHERE id=? AND family_id=?",
  "target_type='task' AND target_id=? AND family_id=?",
])assert.ok(taskBlock.includes(value),`TASK_COMPLETE privacy/integrity guard missing: ${value}`);

const shoppingBlock=source.slice(source.indexOf("if(command.type==='SHOPPING_COMPLETE')"),source.indexOf("if(command.type==='FAMILY_LOG_RECORD')"));
assert.ok(shoppingBlock.length>0,'SHOPPING_COMPLETE handler must exist');
for(const value of [
  's.family_id=?',
  'am.id=? AND am.family_id=s.family_id',
  'am.active=1',
  "goodsVisibilitySql('s')",
  'am.deleted_at IS NULL',
  'SHOPPING_NOT_FOUND_OR_NOT_VISIBLE',
  'AMBIGUOUS_SHOPPING',
  "WHERE id=? AND family_id=?",
])assert.ok(shoppingBlock.includes(value),`SHOPPING_COMPLETE privacy/integrity guard missing: ${value}`);

assert.ok(!taskBlock.includes('task_assignees'),'voice completion must not depend on assignment rows');
assert.ok(taskBlock.includes('INSERT INTO task_completion_history'),'voice completion history must remain');
assert.ok(!shoppingBlock.includes('shopping_assignees')&&!shoppingBlock.includes('s.task_id'),'goods voice completion must not depend on assignment or tasks');

console.log('google-voice-completion-privacy-contract: exact-match ambiguity handling, family scope, PRIVATE ownership, completion history, and independent shopping visibility remain enforced');
