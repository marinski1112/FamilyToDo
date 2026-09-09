import type {AppContext} from './app-context';
import {json} from './response';
import {AuthRequired,BadRequest,Forbidden} from './errors';

type Row=Record<string,unknown>;
const MAX_EXTERNAL_IDS=250;
const MAX_BODY_BYTES=256*1024;

function member(context:AppContext){if(!context.member)throw new AuthRequired();return context.member;}
function isAdmin(role:unknown){return ['OWNER','ADMIN'].includes(String(role||'').toUpperCase());}
function cleanExternalId(value:unknown):string{
  const id=String(value||'').trim();
  if(!id||id.length>255)throw new BadRequest('写真参照IDが不正です。');
  return id;
}

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

/**
 * Resolve already-imported Piyolog BABY_FOOD records to canonical Family Log IDs.
 * The server never receives/parses the PDF or AI output media bytes here; it only
 * resolves allowlisted external IDs from a preconverted manifest. Actual photos
 * still go through the canonical authenticated private Family Log media API.
 */
export async function familyLogImportMediaTargetsApi(request:Request,context:AppContext):Promise<Response>{
  const m=member(context);
  if(!isAdmin(m.role))throw new Forbidden('インポートはOWNER / ADMINのみ行えます。');
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await requestBody(request);
  if(String(body.csrf||'')!==String(context.session.csrfToken||''))throw new Forbidden('CSRF検証に失敗しました。');
  const subjectId=Number(body.subject_id||0);
  if(!Number.isSafeInteger(subjectId)||subjectId<=0)throw new BadRequest('取り込み先が不正です。');
  const subject=await context.env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,m.family_id).first<Row>();
  if(!subject)throw new BadRequest('離乳食写真の取り込み先が見つかりません。');
  const rawIds=body.external_ids;
  if(!Array.isArray(rawIds)||rawIds.length<1||rawIds.length>MAX_EXTERNAL_IDS)throw new BadRequest(`写真参照は1〜${MAX_EXTERNAL_IDS}件です。`);
  const ids=[...new Set(rawIds.map(cleanExternalId))];
  const byExternal=new Map<string,{external_id:string;log_id:number;has_media:boolean}>();
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
    for(const row of rows.results||[]){
      const externalId=String(row.import_external_id||'');
      if(!externalId||byExternal.has(externalId))continue;
      byExternal.set(externalId,{external_id:externalId,log_id:Number(row.id),has_media:Number(row.has_media||0)===1});
    }
  }
  const targets=ids.map(id=>byExternal.get(id)).filter((value):value is {external_id:string;log_id:number;has_media:boolean}=>Boolean(value));
  const found=new Set(targets.map(target=>target.external_id));
  return json({ok:true,targets,missing:ids.filter(id=>!found.has(id))});
}

export const FAMILY_LOG_IMPORT_MEDIA_TARGET_LIMITS={maxExternalIds:MAX_EXTERNAL_IDS,maxBodyBytes:MAX_BODY_BYTES} as const;
