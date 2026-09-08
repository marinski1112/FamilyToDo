import { utcNow } from './timezone';

export const AI_DIAGNOSTIC_ROWS_PER_FAMILY_FEATURE=100;
export const AI_DIAGNOSTIC_MAX_ATTEMPTS=4;

export type AiDiagnosticFeature='ROUGH_INPUT'|'MORNING_DIGEST';
export type AiDiagnosticFinalStatus='AI_NOT_NEEDED'|'AI_OK'|'FALLBACK_DETERMINISTIC'|'BUDGET_OR_CIRCUIT'|'NOT_CONFIGURED'|'DISABLED'|'STORAGE';
export type AiDiagnosticAttemptStatus='AI_OK'|'INVALID_OUTPUT'|'RATE_LIMIT'|'HTTP_ERROR';
export type AiDiagnosticAttempt={model:string;status:AiDiagnosticAttemptStatus;httpStatus?:number|null};
export type AiGenerationDiagnosticEvent={
  familyId:number;
  feature:AiDiagnosticFeature;
  finalStatus:AiDiagnosticFinalStatus;
  attempts?:AiDiagnosticAttempt[];
  acceptedModel?:string|null;
  itemCount?:number|null;
  occurredAt?:string;
};

const FEATURES=new Set<AiDiagnosticFeature>(['ROUGH_INPUT','MORNING_DIGEST']);
const FINAL_STATUSES=new Set<AiDiagnosticFinalStatus>(['AI_NOT_NEEDED','AI_OK','FALLBACK_DETERMINISTIC','BUDGET_OR_CIRCUIT','NOT_CONFIGURED','DISABLED','STORAGE']);
const ATTEMPT_STATUSES=new Set<AiDiagnosticAttemptStatus>(['AI_OK','INVALID_OUTPUT','RATE_LIMIT','HTTP_ERROR']);
const safeModel=(value:unknown):string|null=>{
  const model=String(value??'').trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(model)?model:null;
};
const safeHttpStatus=(value:unknown):number|null=>{
  const status=Number(value);
  return Number.isInteger(status)&&status>=100&&status<=599?status:null;
};
const safeItemCount=(value:unknown):number|null=>{
  const count=Number(value);
  return Number.isInteger(count)&&count>=0&&count<=100?count:null;
};

export async function recordAiGenerationDiagnostic(db:D1Database,event:AiGenerationDiagnosticEvent):Promise<void>{
  const familyId=Number(event.familyId);
  if(!Number.isInteger(familyId)||familyId<=0)throw new Error('invalid diagnostic family');
  if(!FEATURES.has(event.feature)||!FINAL_STATUSES.has(event.finalStatus))throw new Error('invalid diagnostic classification');
  const attempts=(event.attempts||[]).slice(0,AI_DIAGNOSTIC_MAX_ATTEMPTS).map(attempt=>({
    model:safeModel(attempt.model)??'unknown',
    status:ATTEMPT_STATUSES.has(attempt.status)?attempt.status:'HTTP_ERROR' as AiDiagnosticAttemptStatus,
    httpStatus:safeHttpStatus(attempt.httpStatus),
  }));
  const occurredAt=event.occurredAt||utcNow(),acceptedModel=safeModel(event.acceptedModel),itemCount=safeItemCount(event.itemCount);
  await db.prepare('INSERT INTO ai_generation_diagnostics(family_id,feature,occurred_at,final_status,ai_called,attempt_count,accepted_model,item_count,attempts_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(familyId,event.feature,occurredAt,event.finalStatus,attempts.length?1:0,attempts.length,acceptedModel,itemCount,JSON.stringify(attempts),occurredAt).run();
  await db.prepare('DELETE FROM ai_generation_diagnostics WHERE family_id=? AND feature=? AND id NOT IN (SELECT id FROM ai_generation_diagnostics WHERE family_id=? AND feature=? ORDER BY id DESC LIMIT ?)')
    .bind(familyId,event.feature,familyId,event.feature,AI_DIAGNOSTIC_ROWS_PER_FAMILY_FEATURE).run();
}
