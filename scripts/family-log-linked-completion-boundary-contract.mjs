import fs from 'node:fs';

const service=fs.readFileSync('src/family-log-linked-completion.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { logActivity } from './activity-log';",
  "import { updateRecurrenceOccurrenceAggregateCompat } from './recurrence-completion-state';",
  "import { reconcileTaskCompletionAfterAssigneeChange } from './task-completion-reconciliation';",
  'export async function completeLinkedTargetFromFamilyLog(',
  "SELECT id,status,task_kind FROM tasks WHERE id=? AND family_id=? AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?)) LIMIT 1",
  "String(task.task_kind||'').toLowerCase()==='event'",
  'SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1',
  'INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  'await reconcileTaskCompletionAfterAssigneeChange(ctx.env.DB,m.family_id,linkedTaskId,now);',
  "SELECT status FROM tasks WHERE id=? AND family_id=? LIMIT 1",
  "const shouldComplete=String(reconciled?.status||'pending')==='completed';",
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)',
  "target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')",
  "logActivity(ctx,'COMPLETED','task',linkedTaskId",
  "source:'family_log'",
  "AND (t.visibility_scope='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))",
  'SELECT 1 x FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=? LIMIT 1',
  'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?',
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  'await updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB,{',
  'completedBy:isComplete?m.id:null,',
  "logActivity(ctx,'COMPLETED','recurrence',linkedOccurrenceId",
  "message:'関連タスクは指定されていません。'",
]) if(!service.includes(marker)) throw new Error(`Family Log linked completion lost behavior marker: ${marker}`);

if(service.includes('task_assignees')) throw new Error('Family Log completion must not assign the recorder when the linked task has no assignees');
if(service.includes('const done=assignedCount>0\n      ? await ctx.env.DB.prepare(\'SELECT COUNT(*) c FROM task_completions')) throw new Error('Family Log ordinary-task completion must reuse canonical reconciliation instead of duplicating aggregate SQL');
if(service.includes('r.completion_mode')) throw new Error('Family Log recurring completion must read completion_mode from parent tasks, not recurrence_rules');
if(service.includes('UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=?')) throw new Error('Family Log recurring completion must use the retained D1-compatible aggregate helper');
if(service.includes("from './app'")) throw new Error('Family Log linked completion service must not depend on app.ts');
if(service.includes('console.error')) throw new Error('Family Log linked completion service must not log raw exceptions');
if(!manifest.includes("['family-log-linked-completion-boundary','node scripts/family-log-linked-completion-boundary-contract.mjs']")) throw new Error('Family Log linked completion boundary contract is not active');

console.log('Family Log linked completion retained boundary contract ok');