import fs from 'node:fs';

const service=fs.readFileSync('src/family-log-completion.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { logActivity } from './activity-log';",
  "import type { CurrentMember } from './types';",
  'export async function completeLinkedTargetFromFamilyLog(',
  'member:CurrentMember',
  'linkedTaskId:number|null',
  'linkedOccurrenceId:number|null',
  'familyLogId:number',
  'SELECT id,status,completion_mode,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1',
  "String(task.task_kind||'').toLowerCase()==='event'",
  'SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1',
  'JOIN members am ON am.id=ta.member_id AND am.active=1',
  'INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)',
  'ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  "String(task.completion_mode||'ANY').toUpperCase()==='ALL'",
  'UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?',
  "INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)",
  "status IN ('pending','retry')",
  "logActivity(ctx,'COMPLETED','task'",
  'SELECT o.id,o.recurrence_rule_id,r.task_id,r.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? LIMIT 1',
  'SELECT 1 x FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=? LIMIT 1',
  'ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at',
  "String(occ.completion_mode||'ANY').toUpperCase()==='ALL'",
  'UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?',
  "logActivity(ctx,'COMPLETED','recurrence'",
  "source:'family_log'",
  "return {ok:false,message:'関連タスクは指定されていません。'};",
]) if(!service.includes(marker)) throw new Error(`family log completion service lost behavior marker: ${marker}`);

if(service.includes("from './app'")) throw new Error('family log completion service must not depend on app.ts');
if(service.includes('console.error')) throw new Error('family log completion service must not emit raw exceptions');
if(!manifest.includes("['family-log-completion-service-boundary','node scripts/family-log-completion-service-boundary-contract.mjs']")) throw new Error('family log completion service boundary contract is not active');

console.log('retained family log completion service boundary contract ok');
