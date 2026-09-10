import { utcNow } from './timezone';

export const AI_DIAGNOSTIC_ROWS_PER_FAMILY_FEATURE=100;
export const AI_DIAGNOSTIC_MAX_ATTEMPTS=4;

export type AiDiagnosticFeature='ROUGH_INPUT'|'MORNING_DIGEST'|'FAMILY_DAILY_JOURNAL';
export type AiDiagnosticFinalStatus='AI_NOT_NEEDED'|'AI_OK'|'FALLBACK_DETERMINISTIC'|'BUDGET_OR_CIRCUIT'|'NOT_CONFIGURED'|'DISABLED'|'STORAGE';
export type AiDiagnosticAttemptStatus='AI_OK'|'INVALID_OUTPUT'|'RATE_LIMIT'|'HTTP_ERROR';
export type AiDiagnosticReasonCode='HTTP_STATUS'|'RESPONSE_BODY_JSON_INVALID'|'CANDIDATE_TEXT_MISSING'|'MODEL_OUTPUT_JSON_INVALID'|'UNEXPECTED_TOP_LEVEL_KEYS'|'ITEM_VALIDATION_FAILED'|'ITEM_CONTAINER_INVALID'|'ITEM_SCHEMA_INVALID'|'ITEM_VALUE_TYPE_INVALID'|'SOURCE_INDEX_INVALID'|'TITLE_INVALID'|'FIELD_VALUE_INVALID'|'QUANTITY_PROVENANCE_INVALID'|'TOP_LEVEL_CONTAINER_INVALID'|'ITEMS_PROPERTY_NOT_ARRAY'|'ITEM_COUNT_OUT_OF_RANGE'|'ITEM_ENTRY_CONTAINER_INVALID'|'ITEM_KEYS_INVALID'|'SOURCE_INDEX_TYPE_INVALID'|'ORIGINAL_TEXT_TYPE_INVALID'|'TITLE_TYPE_INVALID'|'OPTIONAL_FIELD_TYPE_INVALID'|'SOURCE_INDEX_RANGE_INVALID'|'SOURCE_TEXT_MISMATCH'|'TITLE_EMPTY'|'TITLE_TOO_LONG'|'QUANTITY_EMPTY'|'CATEGORY_EMPTY'|'DESCRIPTION_EMPTY'|'DUE_DATE_FORMAT_INVALID'|'DUE_TIME_FORMAT_INVALID'|'DUE_TIME_WITHOUT_DATE'|'QUANTITY_DESTINATION_INVALID'|'TIME_PROVENANCE_INVALID'|'DATE_PROVENANCE_INVALID'|'SHARED_DEADLINE_MISSING'|'SHARED_DEADLINE_CONFLICT'|'QUANTITY_PROVENANCE_MISSING'|'QUANTITY_NUMBER_MISMATCH'|'DESCRIPTION_DESTINATION_INVALID'|'DUPLICATE_ITEM_OVERFLOW'|'SOURCE_BLOCK_MISSING'|'SUMMARY_CARDINALITY'|'PROVIDER_TIMEOUT'|'PROVIDER_NETWORK_EXCEPTION'|'EXCEPTION';
export type AiDiagnosticFailureStage='PROVIDER_FETCH'|'PROVIDER_RESPONSE'|'RESPONSE_PARSE'|'TOP_LEVEL_VALIDATION'|'ITEM_VALIDATION'|'SUMMARY_VALIDATION';
export type AiDiagnosticAttempt={model:string;status:AiDiagnosticAttemptStatus;httpStatus?:number|null;reasonCode?:AiDiagnosticReasonCode|null;failureStage?:AiDiagnosticFailureStage|null;itemOrdinal?:number|null;sourceIndex?:number|null;expectedCount?:number|null;actualCount?:number|null};
export type AiGenerationDiagnosticEvent={
  familyId:number;
  feature:AiDiagnosticFeature;
  finalStatus:AiDiagnosticFinalStatus;
  attempts?:AiDiagnosticAttempt[];
  acceptedModel?:string|null;
  itemCount?:number|null;
  occurredAt?:string;
};

const FEATURES=new Set<AiDiagnosticFeature>(['ROUGH_INPUT','MORNING_DIGEST','FAMILY_DAILY_JOURNAL']);
const FINAL_STATUSES=new Set<AiDiagnosticFinalStatus>(['AI_NOT_NEEDED','AI_OK','FALLBACK_DETERMINISTIC','BUDGET_OR_CIRCUIT','NOT_CONFIGURED','DISABLED','STORAGE']);
const ATTEMPT_STATUSES=new Set<AiDiagnosticAttemptStatus>(['AI_OK','INVALID_OUTPUT','RATE_LIMIT','HTTP_ERROR']);
const REASON_CODES=new Set<AiDiagnosticReasonCode>(['HTTP_STATUS','RESPONSE_BODY_JSON_INVALID','CANDIDATE_TEXT_MISSING','MODEL_OUTPUT_JSON_INVALID','UNEXPECTED_TOP_LEVEL_KEYS','ITEM_VALIDATION_FAILED','ITEM_CONTAINER_INVALID','ITEM_SCHEMA_INVALID','ITEM_VALUE_TYPE_INVALID','SOURCE_INDEX_INVALID','TITLE_INVALID','FIELD_VALUE_INVALID','QUANTITY_PROVENANCE_INVALID','TOP_LEVEL_CONTAINER_INVALID','ITEMS_PROPERTY_NOT_ARRAY','ITEM_COUNT_OUT_OF_RANGE','ITEM_ENTRY_CONTAINER_INVALID','ITEM_KEYS_INVALID','SOURCE_INDEX_TYPE_INVALID','ORIGINAL_TEXT_TYPE_INVALID','TITLE_TYPE_INVALID','OPTIONAL_FIELD_TYPE_INVALID','SOURCE_INDEX_RANGE_INVALID','SOURCE_TEXT_MISMATCH','TITLE_EMPTY','TITLE_TOO_LONG','QUANTITY_EMPTY','CATEGORY_EMPTY','DESCRIPTION_EMPTY','DUE_DATE_FORMAT_INVALID','DUE_TIME_FORMAT_INVALID','DUE_TIME_WITHOUT_DATE','QUANTITY_DESTINATION_INVALID','TIME_PROVENANCE_INVALID','DATE_PROVENANCE_INVALID','SHARED_DEADLINE_MISSING','SHARED_DEADLINE_CONFLICT','QUANTITY_PROVENANCE_MISSING','QUANTITY_NUMBER_MISMATCH','DESCRIPTION_DESTINATION_INVALID','DUPLICATE_ITEM_OVERFLOW','SOURCE_BLOCK_MISSING','SUMMARY_CARDINALITY','PROVIDER_TIMEOUT','PROVIDER_NETWORK_EXCEPTION','EXCEPTION']);
const FAILURE_STAGES=new Set<AiDiagnosticFailureStage>(['PROVIDER_FETCH','PROVIDER_RESPONSE','RESPONSE_PARSE','TOP_LEVEL_VALIDATION','ITEM_VALIDATION','SUMMARY_VALIDATION']);
const safeModel=(value:unknown):string|null=>{
  const model=String(value??'').trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(model)?model:null;
};
const safeHttpStatus=(value:unknown):number|null=>{
  const status=Number(value);
  return Number.isInteger(status)&&status>=100&&status<=599?status:null;
};
const safeBoundedInt=(value:unknown,min:number,max:number):number|null=>{
  if(value===null||value===undefined)return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:null;
};
const safeItemCount=(value:unknown):number|null=>safeBoundedInt(value,0,100);

export async function recordAiGenerationDiagnostic(db:D1Database,event:AiGenerationDiagnosticEvent):Promise<void>{
  const familyId=Number(event.familyId);
  if(!Number.isInteger(familyId)||familyId<=0)throw new Error('invalid diagnostic family');
  if(!FEATURES.has(event.feature)||!FINAL_STATUSES.has(event.finalStatus))throw new Error('invalid diagnostic classification');
  const attempts=(event.attempts||[]).slice(0,AI_DIAGNOSTIC_MAX_ATTEMPTS).map(attempt=>({
    model:safeModel(attempt.model)??'unknown',
    status:ATTEMPT_STATUSES.has(attempt.status)?attempt.status:'HTTP_ERROR' as AiDiagnosticAttemptStatus,
    httpStatus:safeHttpStatus(attempt.httpStatus),
    reasonCode:attempt.reasonCode&&REASON_CODES.has(attempt.reasonCode)?attempt.reasonCode:null,
    failureStage:attempt.failureStage&&FAILURE_STAGES.has(attempt.failureStage)?attempt.failureStage:null,
    itemOrdinal:safeBoundedInt(attempt.itemOrdinal,1,20),
    sourceIndex:safeBoundedInt(attempt.sourceIndex,0,19),
    expectedCount:safeBoundedInt(attempt.expectedCount,0,100),
    actualCount:safeBoundedInt(attempt.actualCount,0,100),
  }));
  const occurredAt=event.occurredAt||utcNow(),acceptedModel=safeModel(event.acceptedModel),itemCount=safeItemCount(event.itemCount);
  await db.prepare('INSERT INTO ai_generation_diagnostics(family_id,feature,occurred_at,final_status,ai_called,attempt_count,accepted_model,item_count,attempts_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(familyId,event.feature,occurredAt,event.finalStatus,attempts.length?1:0,attempts.length,acceptedModel,itemCount,JSON.stringify(attempts),occurredAt).run();
  await db.prepare('DELETE FROM ai_generation_diagnostics WHERE family_id=? AND feature=? AND id NOT IN (SELECT id FROM ai_generation_diagnostics WHERE family_id=? AND feature=? ORDER BY id DESC LIMIT ?)')
    .bind(familyId,event.feature,familyId,event.feature,AI_DIAGNOSTIC_ROWS_PER_FAMILY_FEATURE).run();
}
