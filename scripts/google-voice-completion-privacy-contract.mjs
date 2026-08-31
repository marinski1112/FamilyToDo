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
  'ta.member_id=? LIMIT 2',
  'am.active=1',
  'TASK_NOT_FOUND_OR_NOT_ASSIGNED',
  'AMBIGUOUS_TASK',
  "WHERE id=? AND family_id=?",
  "target_type='task' AND target_id=? AND family_id=?",
])assert.ok(taskBlock.includes(value),`TASK_COMPLETE privacy/integrity guard missing: ${value}`);

const shoppingBlock=source.slice(source.indexOf("if(command.type==='SHOPPING_COMPLETE')"),source.indexOf("if(command.type==='FAMILY_LOG_RECORD')"));
assert.ok(shoppingBlock.length>0,'SHOPPING_COMPLETE handler must exist');
for(const value of [
  's.family_id=?',
  'sa.member_id=? LIMIT 2',
  'am.active=1',
  's.task_id IS NULL OR EXISTS',
  't.family_id=s.family_id',
  "COALESCE(t.visibility_scope,'FAMILY')='FAMILY'",
  't.private_owner_id=?',
  'SHOPPING_NOT_FOUND_OR_NOT_ASSIGNED',
  'AMBIGUOUS_SHOPPING',
  "WHERE id=? AND family_id=?",
])assert.ok(shoppingBlock.includes(value),`SHOPPING_COMPLETE privacy/integrity guard missing: ${value}`);

assert.ok(!taskBlock.includes('OR ta.member_id IS NULL'),'voice completion must not broaden task completion to unassigned members');
assert.ok(!shoppingBlock.includes('OR sa.member_id IS NULL'),'voice completion must not broaden shopping completion to unassigned members');

console.log('google-voice-completion-privacy-contract: exact-match ambiguity handling, active assignment, family scope, PRIVATE ownership, and parent-task shopping visibility remain enforced');
