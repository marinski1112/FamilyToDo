import fs from 'node:fs';

const service=fs.readFileSync('src/family-log-linked-completion.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { logActivity } from './activity-log';",
  'export async function completeLinkedTargetFromFamilyLog(',
  'SELECT id,status,completion_mode,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1',
  "String(task.task_kind||'').toLowerCase()==='event'",
  'SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1',
  'SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?',
  'const assignedCount=Number(assigned?.c||0);',
  "const actorAssigned=assignedCount>0?await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees",
  'if(assignedCount>0&&!actorAssigned)',
  '記録者が関連タスクの担当者ではないため、自動完了は行いませんでした。',
  'INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  'const done=assignedCount>0',
  'JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?',
  "const mode=assignedCount>0?String(task.completion_mode||'ANY').toUpperCase():'ANY';",
  'UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?',
  'INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)',
  "target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')",
  "logActivity(ctx,'COMPLETED','task',linkedTaskId",
  "source:'family_log'",
  'SELECT o.id,o.recurrence_rule_id,r.task_id,r.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? LIMIT 1',
  'SELECT 1 x FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=? LIMIT 1',
  'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=?',
  "const mode=assignedCount>0?String(occ.completion_mode||'ANY').toUpperCase():'ANY';",
  '記録者が定期タスクの担当者ではないため、自動完了は行いませんでした。',
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  'UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?',
  "logActivity(ctx,'COMPLETED','recurrence',linkedOccurrenceId",
  "message:'関連タスクは指定されていません。'",
]) if(!service.includes(marker)) throw new Error(`Family Log linked completion lost behavior marker: ${marker}`);

if(service.includes('INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)')) throw new Error('Family Log completion must not assign the recorder when the linked task has no assignees');
if(service.includes("from './app'")) throw new Error('Family Log linked completion service must not depend on app.ts');
if(service.includes('console.error')) throw new Error('Family Log linked completion service must not log raw exceptions');
if(!manifest.includes("['family-log-linked-completion-boundary','node scripts/family-log-linked-completion-boundary-contract.mjs']")) throw new Error('Family Log linked completion boundary contract is not active');

console.log('Family Log linked completion retained boundary contract ok');
