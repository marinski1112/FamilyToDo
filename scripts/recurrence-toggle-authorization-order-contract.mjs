import fs from 'node:fs';

const toggle=fs.readFileSync('src/toggle-api.ts','utf8');
const start=toggle.indexOf("if(type==='recurrence'){");
if(start<0) throw new Error('recurrence toggle branch missing');
const end=toggle.indexOf("\n  if(type==='task'){",start);
if(end<=start) throw new Error('recurrence toggle branch boundary missing');
const branch=toggle.slice(start,end);
for(const marker of [
  "if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);",
  "if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);",
  'const recurrenceTaskId=Number(rule.task_id);',
  'const assignedCount=Number(assigned?.c||0);',
  'const actorAssigned=assignedCount>0?',
  "if(assignedCount>0&&!actorAssigned)return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);",
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',
  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?',
  'const done=assignedCount>0',
  'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?',
  "const mode=assignedCount>0?String(rule.completion_mode||'ANY').toUpperCase():'ANY';",
  'const latest=isComplete',
  'const completedBy=isComplete?(Number(latest?.member_id||0)||null):null;',
  'updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB',
]) if(!branch.includes(marker)) throw new Error(`recurrence toggle marker missing: ${marker}`);

if(branch.includes('担当者が設定されていない定期タスクは完了できません。')) throw new Error('recurrence must allow active family completion when the parent task has no assignees');
if(branch.includes('if(!actorAssigned)')) throw new Error('recurrence actor guard must be conditional on an assigned parent task');

const assignedCount=branch.indexOf('const assignedCount=Number(assigned?.c||0);');
const actorGuard=branch.indexOf('if(assignedCount>0&&!actorAssigned)');
const insert=branch.indexOf('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)');
const remove=branch.indexOf('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?');
const doneFallback=branch.indexOf('const done=assignedCount>0');
const modeFallback=branch.indexOf("const mode=assignedCount>0?String(rule.completion_mode||'ANY').toUpperCase():'ANY';");
const aggregate=branch.indexOf('updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB');
if(!(assignedCount>=0&&actorGuard>assignedCount&&insert>actorGuard&&remove>actorGuard&&doneFallback>remove&&modeFallback>doneFallback&&aggregate>modeFallback)) throw new Error('recurrence completion must authorize assigned actors before mutation and resolve assigned/family aggregation before compatibility write');

console.log('recurrence toggle authorization order contract: assigned-only guard and no-assignee family fallback ok');
