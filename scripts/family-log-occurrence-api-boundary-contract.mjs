import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-occurrence-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { completeLinkedTargetFromFamilyLog } from './family-log-linked-completion';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { json } from './response';",
  'export async function recordOccurrenceFamilyLog(request:Request,ctx:AppContext):Promise<Response>{',
  "code:'AUTH_REQUIRED'",
  "request.method!=='POST'",
  "code:'BAD_REQUEST'",
  "code:'FORBIDDEN'",
  'ctx.session.csrfToken??=crypto.randomUUID()',
  "b.csrf!==ctx.session.csrfToken",
  "WHERE o.id=? AND o.family_id=? AND o.status<>'excluded' LIMIT 1",
  "String(row.task_kind||'').toUpperCase()==='EVENT'",
  'SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1',
  'familyLogEnabledTypes(subject).includes(String(row.log_type))',
  'SELECT COUNT(*) c FROM task_assignees ta JOIN members mm ON mm.id=ta.member_id AND mm.active=1 WHERE ta.task_id=?',
  'SELECT 1 x FROM task_assignees WHERE task_id=? AND member_id=? LIMIT 1',
  "記録者がこの定期タスクの担当者ではありません。",
  'SELECT id FROM family_logs WHERE task_family_log_template_id=? AND linked_occurrence_id=? AND created_by=? AND deleted_at IS NULL LIMIT 1',
  'INSERT OR IGNORE INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id)',
  "String(row.occurrence_date)===today?now:`${row.occurrence_date} 12:00:00`",
  'completeLinkedTargetFromFamilyLog(ctx,null,occurrenceId,logId)',
  'UPDATE family_logs SET deleted_at=?,updated_at=? WHERE id=? AND family_id=?',
  'return json({ok:true,id:logId,already:!created,status:completion.status,message:completion.message});',
]) if(!api.includes(marker)) throw new Error(`recurrence Family Log API lost behavior marker: ${marker}`);

if(api.includes("from './app'")) throw new Error('recurrence Family Log API must not depend on app.ts');
if(api.includes('/api/toggle')) throw new Error('recurrence Family Log extraction must not change /api/toggle behavior');
if(!routes.includes("import { recordOccurrenceFamilyLog } from './family-log-occurrence-api';")) throw new Error('context API dispatcher must import retained recurrence Family Log API');
if(routes.includes('familyLog, recordOccurrenceFamilyLog')) throw new Error('context API dispatcher must not import recordOccurrenceFamilyLog from app.ts');
if(!routes.includes("if(url.pathname==='/api/recurrence/family-log-complete') return await recordOccurrenceFamilyLog(request,context);")) throw new Error('recurrence Family Log route changed unexpectedly');
if(!manifest.includes("['family-log-occurrence-api-boundary','node scripts/family-log-occurrence-api-boundary-contract.mjs']")) throw new Error('recurrence Family Log API boundary contract is not active');

console.log('recurrence Family Log retained API boundary contract ok');
