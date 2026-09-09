import type {AppContext} from './app-context';
import {json} from './response';
import {AuthRequired,BadRequest,Forbidden} from './errors';
import {DEFAULT_FAMILY_TIMEZONE,familyNow,parseImportDateTime} from './timezone';

type Row=Record<string,unknown>;
const MAX_EXTERNAL_IDS=250;
const MAX_PROMOTION_RECORDS=250;
const MAX_BODY_BYTES=256*1024;

function member(context:AppContext){if(!context.member)throw new AuthRequired();return context.member;}
function isAdmin(role:unknown){return ['OWNER','ADMIN'].includes(String(role||'').toUpperCase());}
function cleanExternalId(value:unknown):string{
  const id=String(value||'').trim();
  if(!id||id.length>255)throw new BadRequest('写真参照IDが不正です。');
  return id;
}
function optionalText(value:unknown,max:number){if(value==null)return null;const text=String(value).trim();if(text.length>max)throw new BadRequest('離乳食記録の文字数が上限を超えています。');return text||null;}
async function sha256(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}

async function requestBody(request:Request):Promise<Record<string,unknown>>{
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new BadRequest('写真参照が大きすぎます。');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new BadRequest('写真参照が大きすぎます。');
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{parsed=null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new BadRequest('写真参照が不正です。');
  return parsed as Record<string,unknown>;
}

async function checkedSubject(context:AppContext,subjectId:number){
  const m=member(context);
  if(!Number.isSafeInteger(subjectId)||subjectId<=0)throw new BadRequest('取り込み先が不正です。');
  const subject=await context.env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,m.family_id).first<Row>();
  if(!subject)throw new BadRequest('離乳食写真の取り込み先が見つかりません。');
  return subject;
}

type PromotionRecord={index:number;externalId:string|null;occurredAt:string;legacyOccurredAt:string|null;amount:number|null;unit:string|null;duration:number|null;valueText:string|null;sourceText:string|null;targetKey:string};
function sameNullable(a:unknown,b:string|null){return String(a??'')===String(b??'');}
async function normalizePromotionRecord(raw:unknown,index:number,timeZone:string,familyId:number,subjectId:number,source:string):Promise<PromotionRecord>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequest('離乳食記録が不正です。');
  const record=raw as Record<string,unknown>;
  if(String(record.log_type||'').toUpperCase()!=='MEAL'||String(record.detail_code||'').toUpperCase()!=='BABY_FOOD')throw new BadRequest('離乳食分類の更新対象が不正です。');
  const occurredAt=parseImportDateTime(record.occurred_at,timeZone);
  const rawDate=String(record.occurred_at||'');
  const legacyOccurredAt=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawDate)?new Date(rawDate).toISOString().slice(0,19).replace('T',' '):null;
  const amount=record.amount==null?null:Number(record.amount);if(amount!==null&&!Number.isFinite(amount))throw new BadRequest('離乳食記録の数値が不正です。');
  const duration=record.duration_minutes==null?null:Number(record.duration_minutes);if(duration!==null&&(!Number.isInteger(duration)||duration<0||duration>10080))throw new BadRequest('離乳食記録の時間が不正です。');
  const unit=optionalText(record.unit,40),valueText=optionalText(record.value_text,255),sourceText=optionalText(record.source_text,4000),externalId=record.external_id==null?null:optionalText(record.external_id,255);
  const canonical=JSON.stringify([familyId,subjectId,source,occurredAt,'MEAL','BABY_FOOD',amount,unit,duration,valueText,sourceText]);
  return {index,externalId,occurredAt,legacyOccurredAt,amount,unit,duration,valueText,sourceText,targetKey:await sha256(canonical)};
}

async function promotionPlan(context:AppContext,subjectId:number,sourceValue:unknown,rawRecords:unknown){
  const m=member(context);await checkedSubject(context,subjectId);
  const source=String(sourceValue||'').trim().slice(0,80);if(source.toLowerCase()!=='piyolog')throw new BadRequest('離乳食分類の更新はぴよログ変換データだけが対象です。');
  if(!Array.isArray(rawRecords)||rawRecords.length>MAX_PROMOTION_RECORDS)throw new BadRequest(`離乳食分類の更新対象は${MAX_PROMOTION_RECORDS}件以内です。`);
  const family=await context.env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(m.family_id).first<Row>(),timeZone=String(family?.timezone||DEFAULT_FAMILY_TIMEZONE);
  const records=await Promise.all(rawRecords.map((record,index)=>normalizePromotionRecord(record,index,timeZone,Number(m.family_id),subjectId,source)));
  if(!records.length)return {records,promotions:[] as Array<PromotionRecord&{logId:number}>,already:0,ambiguous:0,timeZone};
  const targetKeys=[...new Set(records.map(record=>record.targetKey))],existingTargetKeys=new Set<string>();
  for(let offset=0;offset<targetKeys.length;offset+=90){const part=targetKeys.slice(offset,offset+90),marks=part.map(()=>'?').join(',');const rows=await context.env.DB.prepare(`SELECT import_source_key FROM family_logs WHERE family_id=? AND subject_id=? AND deleted_at IS NULL AND import_source_key IN (${marks})`).bind(m.family_id,subjectId,...part).all<Row>();for(const row of rows.results||[])existingTargetKeys.add(String(row.import_source_key||''));}
  const times=[...new Set(records.flatMap(record=>[record.occurredAt,record.legacyOccurredAt].filter((value):value is string=>Boolean(value))))],genericRows:Row[]=[];
  for(let offset=0;offset<times.length;offset+=90){const part=times.slice(offset,offset+90),marks=part.map(()=>'?').join(',');const rows=await context.env.DB.prepare(`SELECT l.id,l.occurred_at,l.import_external_id,l.import_source_text,l.value_text,l.import_source_key
      FROM family_logs l JOIN family_log_import_batches b ON b.id=l.import_batch_id AND b.family_id=l.family_id AND b.subject_id=l.subject_id
      WHERE l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL AND l.log_type='MEAL'
        AND COALESCE(l.detail_code,'')<>'BABY_FOOD' AND lower(b.source)='piyolog' AND l.occurred_at IN (${marks})
      ORDER BY l.id`).bind(m.family_id,subjectId,...part).all<Row>();genericRows.push(...(rows.results||[]));}
  const claimed=new Set<number>(),promotions:Array<PromotionRecord&{logId:number}>=[];let already=0,ambiguous=0;
  for(const record of records){
    if(existingTargetKeys.has(record.targetKey)){already++;continue;}
    let candidates=genericRows.filter(row=>String(row.occurred_at||'')===record.occurredAt||Boolean(record.legacyOccurredAt&&String(row.occurred_at||'')===record.legacyOccurredAt));
    if(candidates.length>1&&record.externalId){const exact=candidates.filter(row=>String(row.import_external_id||'')===record.externalId);if(exact.length)candidates=exact;}
    if(candidates.length>1){const exactText=candidates.filter(row=>sameNullable(row.import_source_text,record.sourceText)&&sameNullable(row.value_text,record.valueText));if(exactText.length)candidates=exactText;}
    if(candidates.length===1){const logId=Number(candidates[0].id);if(!Number.isSafeInteger(logId)||logId<=0||claimed.has(logId)){ambiguous++;continue;}claimed.add(logId);promotions.push({...record,logId});continue;}
    if(candidates.length>1)ambiguous++;
  }
  return {records,promotions,already,ambiguous,timeZone};
}

async function promotionResponse(context:AppContext,body:Record<string,unknown>,apply:boolean){
  const m=member(context),subjectId=Number(body.subject_id||0),plan=await promotionPlan(context,subjectId,body.source,body.records);
  if(plan.ambiguous)throw new BadRequest('同じ時刻の既存ぴよログ食事記録が複数あり、安全に離乳食へ更新できません。該当記録を確認してください。');
  if(!apply)return json({ok:true,promote_count:plan.promotions.length,already_baby_food_count:plan.already,ambiguous_count:0,promote_indices:plan.promotions.map(item=>item.index)});
  const now=familyNow(plan.timeZone),statements=plan.promotions.map(item=>context.env.DB.prepare(`UPDATE family_logs SET detail_code='BABY_FOOD',import_source_key=?,updated_at=?
      WHERE id=? AND family_id=? AND subject_id=? AND deleted_at IS NULL AND log_type='MEAL' AND COALESCE(detail_code,'')<>'BABY_FOOD'
        AND import_batch_id IN (SELECT id FROM family_log_import_batches WHERE family_id=? AND subject_id=? AND lower(source)='piyolog')
        AND NOT EXISTS(SELECT 1 FROM family_logs x WHERE x.family_id=? AND x.subject_id=? AND x.deleted_at IS NULL AND x.import_source_key=? AND x.id<>?)`).bind(item.targetKey,now,item.logId,m.family_id,subjectId,m.family_id,subjectId,m.family_id,subjectId,item.targetKey,item.logId));
  const results=statements.length?await context.env.DB.batch(statements):[],applied=results.reduce((sum,result)=>sum+Number(result.meta?.changes||0),0);
  if(applied!==plan.promotions.length)throw new BadRequest('離乳食分類の更新対象が確認後に変わりました。再度プレビューしてください。');
  return json({ok:true,promoted_count:applied,already_baby_food_count:plan.already});
}

/**
 * Resolve already-imported Piyolog BABY_FOOD records to canonical Family Log IDs.
 * The same private admin/CSRF boundary also supports a bounded, explicit repair:
 * an existing Piyolog MEAL at the same source time can be promoted in place to
 * BABY_FOOD before canonical re-import. This preserves the log id/media linkage
 * while moving its import_source_key to the BABY_FOOD canonical identity, so the
 * normal importer sees the corrected record as a duplicate instead of adding one.
 */
export async function familyLogImportMediaTargetsApi(request:Request,context:AppContext):Promise<Response>{
  const m=member(context);
  if(!isAdmin(m.role))throw new Forbidden('インポートはOWNER / ADMINのみ行えます。');
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await requestBody(request);
  if(String(body.csrf||'')!==String(context.session.csrfToken||''))throw new Forbidden('CSRF検証に失敗しました。');
  const action=String(body.action||'media_targets');
  if(action==='promotion_preview')return promotionResponse(context,body,false);
  if(action==='promotion_apply')return promotionResponse(context,body,true);
  if(action!=='media_targets')throw new BadRequest('操作が不正です。');
  const subjectId=Number(body.subject_id||0);await checkedSubject(context,subjectId);
  const rawIds=body.external_ids;
  if(!Array.isArray(rawIds)||rawIds.length<1||rawIds.length>MAX_EXTERNAL_IDS)throw new BadRequest(`写真参照は1〜${MAX_EXTERNAL_IDS}件です。`);
  const ids=[...new Set(rawIds.map(cleanExternalId))];
  const byExternal=new Map<string,{external_id:string;log_id:number;has_media:boolean}>();
  const ambiguous=new Set<string>();
  for(let offset=0;offset<ids.length;offset+=70){
    const part=ids.slice(offset,offset+70),marks=part.map(()=>'?').join(',');
    const rows=await context.env.DB.prepare(`SELECT l.id,l.import_external_id,
      EXISTS(SELECT 1 FROM family_log_media fm WHERE fm.family_id=l.family_id AND fm.log_id=l.id) AS has_media
      FROM family_logs l
      JOIN family_log_import_batches b ON b.id=l.import_batch_id AND b.family_id=l.family_id AND b.subject_id=l.subject_id
      WHERE l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL
        AND l.log_type='MEAL' AND l.detail_code='BABY_FOOD'
        AND lower(b.source)='piyolog' AND l.import_external_id IN (${marks})
      ORDER BY l.id DESC`).bind(m.family_id,subjectId,...part).all<Row>();
    const grouped=new Map<string,Row[]>();for(const row of rows.results||[]){const id=String(row.import_external_id||'');if(!id)continue;const values=grouped.get(id)||[];values.push(row);grouped.set(id,values);}
    for(const [externalId,values] of grouped){if(values.length!==1){ambiguous.add(externalId);continue;}const row=values[0];byExternal.set(externalId,{external_id:externalId,log_id:Number(row.id),has_media:Number(row.has_media||0)===1});}
  }
  if(ambiguous.size)throw new BadRequest('同じ写真参照IDの離乳食記録が複数あるため、安全に写真を紐付けできません。');
  const targets=ids.map(id=>byExternal.get(id)).filter((value):value is {external_id:string;log_id:number;has_media:boolean}=>Boolean(value));
  const found=new Set(targets.map(target=>target.external_id));
  return json({ok:true,targets,missing:ids.filter(id=>!found.has(id))});
}

export const FAMILY_LOG_IMPORT_MEDIA_TARGET_LIMITS={maxExternalIds:MAX_EXTERNAL_IDS,maxPromotionRecords:MAX_PROMOTION_RECORDS,maxBodyBytes:MAX_BODY_BYTES} as const;
