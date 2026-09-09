import type {AppContext} from './app-context';
import {json} from './response';
import {AuthRequired,BadRequest,Forbidden} from './errors';

type Row=Record<string,unknown>;
type DuplicateClass='exact'|'likely'|'ambiguous';
type Provenance='MANUAL'|'PIYOLOG_IMPORT'|'IMPORT';

const MAX_BODY_BYTES=16*1024;
const MAX_RANGE_DAYS=90;
const MAX_ROWS=1500;
const MAX_CANDIDATE_PAIRS=500;

function member(context:AppContext){if(!context.member)throw new AuthRequired();return context.member;}
function isAdmin(role:unknown){return ['OWNER','ADMIN'].includes(String(role||'').toUpperCase());}
function normalizeText(value:unknown){return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();}
function nullableNumber(value:unknown):number|null{return value==null||value===''?null:Number(value);}
function sameNumber(a:unknown,b:unknown){const left=nullableNumber(a),right=nullableNumber(b);return left===right||(left!==null&&right!==null&&Number.isFinite(left)&&Number.isFinite(right)&&left===right);}
function provenance(row:Row):Provenance{
  if(!row.import_batch_id)return 'MANUAL';
  return normalizeText(row.import_source)==='piyolog'?'PIYOLOG_IMPORT':'IMPORT';
}
function dateOnly(value:unknown,label:string){
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new BadRequest(`${label}が不正です。`);
  const date=new Date(`${text}T00:00:00Z`);
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==text)throw new BadRequest(`${label}が不正です。`);
  return {text,date};
}
function nextDate(date:Date){const value=new Date(date.getTime()+86400000);return value.toISOString().slice(0,10);}
function contentText(row:Row){return normalizeText([row.note,row.import_source_text].filter(value=>String(value??'').trim()).join('\n'));}
function isBabyFood(row:Row){return normalizeText(row.log_type)==='meal'&&normalizeText(row.detail_code)==='baby_food';}
function pairEligible(a:Row,b:Row){
  if(String(a.occurred_at||'')!==String(b.occurred_at||''))return false;
  if(normalizeText(a.log_type)!==normalizeText(b.log_type))return false;
  if(isBabyFood(a)||isBabyFood(b))return normalizeText(a.detail_code)===normalizeText(b.detail_code);
  return true;
}
function classifyPair(a:Row,b:Row):{classification:DuplicateClass;comparison:{detail_equal:boolean;amount_equal:boolean;unit_equal:boolean;duration_equal:boolean;value_equal:boolean;content_equal:boolean;provenance_equal:boolean}}{
  const comparison={
    detail_equal:normalizeText(a.detail_code)===normalizeText(b.detail_code),
    amount_equal:sameNumber(a.amount,b.amount),
    unit_equal:normalizeText(a.unit)===normalizeText(b.unit),
    duration_equal:sameNumber(a.duration_minutes,b.duration_minutes),
    value_equal:normalizeText(a.value_text)===normalizeText(b.value_text),
    content_equal:contentText(a)===contentText(b),
    provenance_equal:provenance(a)===provenance(b),
  };
  const coreEqual=comparison.detail_equal&&comparison.amount_equal&&comparison.unit_equal&&comparison.duration_equal&&comparison.value_equal;
  const classification:DuplicateClass=coreEqual&&comparison.content_equal?'exact':coreEqual?'likely':'ambiguous';
  return {classification,comparison};
}
function publicRecord(row:Row){
  return {
    id:Number(row.id),
    occurred_at:String(row.occurred_at||''),
    log_type:String(row.log_type||''),
    detail_code:row.detail_code==null?null:String(row.detail_code),
    amount:row.amount==null?null:Number(row.amount),
    unit:row.unit==null?null:String(row.unit),
    duration_minutes:row.duration_minutes==null?null:Number(row.duration_minutes),
    value_text:row.value_text==null?null:String(row.value_text),
    provenance:provenance(row),
    has_media:Number(row.has_media||0)===1,
    edited:Boolean(row.created_at&&row.updated_at&&String(row.created_at)!==String(row.updated_at)),
    has_import_identity:Boolean(row.import_source_key||row.import_external_id),
  };
}
async function requestBody(request:Request):Promise<Record<string,unknown>>{
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new BadRequest('重複確認条件が大きすぎます。');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new BadRequest('重複確認条件が大きすぎます。');
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{parsed=null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new BadRequest('重複確認条件が不正です。');
  return parsed as Record<string,unknown>;
}
async function checkedSubject(context:AppContext,subjectId:number){
  const m=member(context);
  if(!Number.isSafeInteger(subjectId)||subjectId<=0)throw new BadRequest('確認対象が不正です。');
  const subject=await context.env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,m.family_id).first<Row>();
  if(!subject)throw new BadRequest('確認対象が見つかりません。');
}

/**
 * Read-only duplicate candidate preview. This endpoint deliberately does not
 * choose a winner or mutate rows: manual edits, import identity and private
 * media must be reviewed before any later selected-id soft-delete action.
 */
export async function familyLogDuplicatePreviewApi(request:Request,context:AppContext):Promise<Response>{
  const m=member(context);
  if(!isAdmin(m.role))throw new Forbidden('重複確認はOWNER / ADMINのみ行えます。');
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await requestBody(request);
  if(String(body.csrf||'')!==String(context.session.csrfToken||''))throw new Forbidden('CSRF検証に失敗しました。');
  const subjectId=Number(body.subject_id||0);await checkedSubject(context,subjectId);
  const from=dateOnly(body.date_from,'開始日'),to=dateOnly(body.date_to,'終了日');
  if(to.date.getTime()<from.date.getTime())throw new BadRequest('終了日は開始日以降にしてください。');
  const rangeDays=Math.floor((to.date.getTime()-from.date.getTime())/86400000)+1;
  if(rangeDays>MAX_RANGE_DAYS)throw new BadRequest(`重複確認は${MAX_RANGE_DAYS}日以内で指定してください。`);
  const rowsResult=await context.env.DB.prepare(`SELECT l.id,l.occurred_at,l.log_type,l.detail_code,l.amount,l.unit,l.duration_minutes,l.value_text,l.note,
      l.created_at,l.updated_at,l.import_batch_id,l.import_source_key,l.import_source_text,l.import_external_id,b.source AS import_source,
      EXISTS(SELECT 1 FROM family_log_media fm WHERE fm.family_id=l.family_id AND fm.log_id=l.id) AS has_media
    FROM family_logs l
    LEFT JOIN family_log_import_batches b ON b.id=l.import_batch_id AND b.family_id=l.family_id AND b.subject_id=l.subject_id
    WHERE l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL AND l.occurred_at>=? AND l.occurred_at<?
    ORDER BY l.occurred_at,l.log_type,l.id
    LIMIT ?`).bind(m.family_id,subjectId,`${from.text} 00:00:00`,`${nextDate(to.date)} 00:00:00`,MAX_ROWS+1).all<Row>();
  const rows=rowsResult.results||[];
  if(rows.length>MAX_ROWS)throw new BadRequest('対象記録が多すぎます。期間を短くして再確認してください。');
  const buckets=new Map<string,Row[]>();
  for(const row of rows){const key=`${String(row.occurred_at||'')}\u0000${normalizeText(row.log_type)}`;const values=buckets.get(key)||[];values.push(row);buckets.set(key,values);}
  let possiblePairs=0;
  for(const values of buckets.values())if(values.length>1)possiblePairs+=values.length*(values.length-1)/2;
  if(possiblePairs>MAX_CANDIDATE_PAIRS)throw new BadRequest('同時刻の候補が多すぎます。期間を短くして再確認してください。');
  const candidates:Array<{classification:DuplicateClass;records:[ReturnType<typeof publicRecord>,ReturnType<typeof publicRecord>];comparison:ReturnType<typeof classifyPair>['comparison']}>=[];
  for(const values of buckets.values()){
    for(let left=0;left<values.length;left++)for(let right=left+1;right<values.length;right++){
      const a=values[left],b=values[right];if(!pairEligible(a,b))continue;
      const result=classifyPair(a,b);candidates.push({classification:result.classification,records:[publicRecord(a),publicRecord(b)],comparison:result.comparison});
    }
  }
  const counts={exact:0,likely:0,ambiguous:0};for(const candidate of candidates)counts[candidate.classification]++;
  return json({ok:true,read_only:true,subject_id:subjectId,date_from:from.text,date_to:to.text,scanned_count:rows.length,candidate_count:candidates.length,counts,candidates});
}

export const FAMILY_LOG_DUPLICATE_PREVIEW_LIMITS={maxBodyBytes:MAX_BODY_BYTES,maxRangeDays:MAX_RANGE_DAYS,maxRows:MAX_ROWS,maxCandidatePairs:MAX_CANDIDATE_PAIRS} as const;
