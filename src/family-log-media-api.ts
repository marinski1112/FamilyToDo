import type {AppContext} from './app-context';
import {json} from './response';

const MAX_IMAGE_BYTES=4*1024*1024;
type FamilyLogImageMime='image/jpeg'|'image/png'|'image/webp';
type Scope={familyId:number;memberId:number};
type MediaRow={id:number;log_id:number;subject_id:number;storage_key:string;mime_type:string;byte_size:number;reconcile_pending?:number};
type ParentRow={id:number;subject_id:number;deleted_at:string|null;log_type:string;detail_code:string|null;subject_kind:string};
type CleanupPurpose='ORPHAN'|'DELETE';

function scope(context:AppContext):Scope|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

function positiveId(value:string|null):number|null{
  if(!value)return null;
  const id=Number(value);
  return Number.isSafeInteger(id)&&id>0?id:null;
}

async function activeMember(env:Env,familyId:number,memberId:number):Promise<boolean>{
  return Boolean(await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL LIMIT 1').bind(memberId,familyId).first());
}

function imageMime(value:unknown):FamilyLogImageMime|null{
  const mime=String(value||'').split(';',1)[0]!.trim().toLowerCase();
  return mime==='image/jpeg'||mime==='image/png'||mime==='image/webp'?mime:null;
}

function extensionFor(mime:FamilyLogImageMime):string{
  return mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
}

function hasValidSignature(bytes:Uint8Array,mime:FamilyLogImageMime):boolean{
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==='image/png')return bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index)=>bytes[index]===value);
  return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
}

function matchesIfNoneMatch(value:string|null,etag:string):boolean{
  return Boolean(value&&etag&&value.split(',').some(candidate=>candidate.trim()==='*'||candidate.trim()===etag));
}

async function readBoundedBody(request:Request,maxBytes:number):Promise<ArrayBuffer|null>{
  if(!request.body)return new ArrayBuffer(0);
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel().catch(()=>{});return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const output=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}
  return output.buffer;
}

async function mediaById(env:Env,familyId:number,mediaId:number,requireVisibleParent:boolean):Promise<MediaRow|null>{
  const parentClause=requireVisibleParent?" AND l.deleted_at IS NULL AND l.log_type='MEAL' AND l.detail_code='BABY_FOOD' AND s.subject_kind IN ('BABY','CHILD')":'';
  return await env.DB.prepare(`SELECT m.id,m.log_id,m.subject_id,m.storage_key,m.mime_type,m.byte_size,m.reconcile_pending
    FROM family_log_media m
    JOIN family_logs l ON l.id=m.log_id AND l.family_id=m.family_id AND l.subject_id=m.subject_id
    JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id${parentClause}
    WHERE m.id=? AND m.family_id=? LIMIT 1`).bind(mediaId,familyId).first<MediaRow>()||null;
}

async function mediaByLog(env:Env,familyId:number,logId:number):Promise<MediaRow|null>{
  return await env.DB.prepare(`SELECT m.id,m.log_id,m.subject_id,m.storage_key,m.mime_type,m.byte_size,m.reconcile_pending
    FROM family_log_media m
    JOIN family_logs l ON l.id=m.log_id AND l.family_id=m.family_id AND l.subject_id=m.subject_id
    JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
    WHERE m.log_id=? AND m.family_id=? AND l.deleted_at IS NULL
      AND l.log_type='MEAL' AND l.detail_code='BABY_FOOD' AND s.subject_kind IN ('BABY','CHILD')
    LIMIT 1`).bind(logId,familyId).first<MediaRow>()||null;
}

async function mediaRowByLog(env:Env,familyId:number,logId:number):Promise<MediaRow|null>{
  return await env.DB.prepare('SELECT id,log_id,subject_id,storage_key,mime_type,byte_size,reconcile_pending FROM family_log_media WHERE family_id=? AND log_id=? LIMIT 1').bind(familyId,logId).first<MediaRow>()||null;
}

async function parentByLog(env:Env,familyId:number,logId:number):Promise<ParentRow|null>{
  return await env.DB.prepare(`SELECT l.id,l.subject_id,l.deleted_at,l.log_type,l.detail_code,s.subject_kind
    FROM family_logs l
    JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
    WHERE l.id=? AND l.family_id=? LIMIT 1`).bind(logId,familyId).first<ParentRow>()||null;
}

async function babyFoodParent(env:Env,familyId:number,logId:number):Promise<{id:number;subject_id:number}|null>{
  return await env.DB.prepare(`SELECT l.id,l.subject_id
    FROM family_logs l
    JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id AND s.active=1
    WHERE l.id=? AND l.family_id=? AND l.deleted_at IS NULL
      AND l.log_type='MEAL' AND l.detail_code='BABY_FOOD'
      AND s.subject_kind IN ('BABY','CHILD')
    LIMIT 1`).bind(logId,familyId).first<{id:number;subject_id:number}>()||null;
}

function publicMetadata(row:MediaRow){
  return {id:Number(row.id),logId:Number(row.log_id),subjectId:Number(row.subject_id),mimeType:String(row.mime_type),bytes:Number(row.byte_size),url:`/api/family-log-media?media=${Number(row.id)}`};
}

async function queueObjectCleanup(env:Env,familyId:number,storageKey:string,purpose:CleanupPurpose):Promise<void>{
  await env.DB.prepare(`INSERT INTO family_log_media_cleanup_queue(family_id,storage_key,purpose,created_at,attempts,last_attempt_at)
    VALUES(?,?,?,?,0,NULL)
    ON CONFLICT(storage_key) DO UPDATE SET purpose=excluded.purpose,created_at=excluded.created_at`).bind(familyId,storageKey,purpose,new Date().toISOString()).run();
}

async function deleteQueuedObject(env:Env,familyId:number,storageKey:string):Promise<boolean>{
  const queued=await env.DB.prepare('SELECT purpose FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=? LIMIT 1').bind(familyId,storageKey).first<{purpose:string}>();
  if(!queued)return true;
  const purpose=String(queued.purpose);
  if(purpose==='ORPHAN'){
    const linked=await env.DB.prepare('SELECT id FROM family_log_media WHERE family_id=? AND storage_key=? LIMIT 1').bind(familyId,storageKey).first();
    if(linked){
      await env.DB.prepare('DELETE FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=?').bind(familyId,storageKey).run();
      return true;
    }
  }
  try{
    await env.MEDIA.delete(storageKey);
    if(purpose==='DELETE'){
      await env.DB.prepare('DELETE FROM family_log_media WHERE family_id=? AND storage_key=?').bind(familyId,storageKey).run();
    }
    await env.DB.prepare('DELETE FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=?').bind(familyId,storageKey).run();
    return true;
  }catch{
    await env.DB.prepare('UPDATE family_log_media_cleanup_queue SET attempts=attempts+1,last_attempt_at=? WHERE family_id=? AND storage_key=?').bind(new Date().toISOString(),familyId,storageKey).run().catch(()=>{});
    return false;
  }
}

async function cleanupMediaRow(env:Env,familyId:number,row:MediaRow):Promise<boolean>{
  const key=String(row.storage_key);
  await queueObjectCleanup(env,familyId,key,'DELETE');
  if(!(await deleteQueuedObject(env,familyId,key))){
    await env.DB.prepare('UPDATE family_log_media SET reconcile_pending=1 WHERE id=? AND family_id=?').bind(Number(row.id),familyId).run().catch(()=>{});
    return false;
  }
  return true;
}

/** Revalidate one attachment after any parent edit/soft-delete without duplicating the canonical Family Log mutation logic. */
export async function reconcileFamilyLogMediaForLog(env:Env,familyId:number,logId:number):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(logId)||logId<=0)return;
  const row=await mediaRowByLog(env,familyId,logId);
  if(!row)return;
  const parent=await parentByLog(env,familyId,logId);
  const eligible=Boolean(parent&&!parent.deleted_at&&String(parent.log_type)==='MEAL'&&String(parent.detail_code||'')==='BABY_FOOD'&&['BABY','CHILD'].includes(String(parent.subject_kind))&&Number(parent.subject_id)===Number(row.subject_id));
  if(!eligible){await cleanupMediaRow(env,familyId,row);return;}
  if(Number(row.reconcile_pending||0)!==0)await env.DB.prepare('UPDATE family_log_media SET reconcile_pending=0 WHERE id=? AND family_id=?').bind(Number(row.id),familyId).run();
}

/** Best-effort bounded retry for durable cleanup/reconciliation markers. Fresh ORPHAN rows are held briefly so an in-flight upload cannot be reclaimed. */
export async function reconcilePendingFamilyLogMedia(env:Env,familyId:number,limit=8):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0)return;
  const cap=Math.max(1,Math.min(24,Math.trunc(limit)||8));
  const queued=await env.DB.prepare(`SELECT storage_key FROM family_log_media_cleanup_queue
    WHERE family_id=? AND (purpose='DELETE' OR datetime(created_at)<=datetime('now','-5 minutes'))
    ORDER BY id LIMIT ?`).bind(familyId,cap).all<{storage_key:string}>();
  for(const item of queued.results||[])await deleteQueuedObject(env,familyId,String(item.storage_key));
  const pending=await env.DB.prepare('SELECT log_id FROM family_log_media WHERE family_id=? AND reconcile_pending=1 ORDER BY id LIMIT ?').bind(familyId,cap).all<{log_id:number}>();
  for(const item of pending.results||[])await reconcileFamilyLogMediaForLog(env,familyId,Number(item.log_id));
}

/** Drain all immediately actionable reconciliation work in batches; transient R2 failures remain durably queued. */
export async function drainPendingFamilyLogMedia(env:Env,familyId:number):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0)return;
  for(let batch=0;batch<128;batch++){
    const before=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM family_log_media WHERE family_id=? AND reconcile_pending=1) +
      (SELECT COUNT(*) FROM family_log_media_cleanup_queue WHERE family_id=? AND (purpose='DELETE' OR datetime(created_at)<=datetime('now','-5 minutes'))) AS count`).bind(familyId,familyId).first<{count:number}>();
    const count=Number(before?.count||0);
    if(count<=0)return;
    await reconcilePendingFamilyLogMedia(env,familyId,24);
    const after=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM family_log_media WHERE family_id=? AND reconcile_pending=1) +
      (SELECT COUNT(*) FROM family_log_media_cleanup_queue WHERE family_id=? AND (purpose='DELETE' OR datetime(created_at)<=datetime('now','-5 minutes'))) AS count`).bind(familyId,familyId).first<{count:number}>();
    if(Number(after?.count||0)>=count)return;
  }
}

/** Remove the private object and metadata after a canonical Family Log soft-delete, preserving retry state on transient R2 failure. */
export async function cleanupFamilyLogMediaForLog(env:Env,familyId:number,logId:number):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(logId)||logId<=0)return;
  await env.DB.prepare('UPDATE family_log_media SET reconcile_pending=1 WHERE family_id=? AND log_id=?').bind(familyId,logId).run();
  await reconcileFamilyLogMediaForLog(env,familyId,logId);
}

/** Authenticated same-family proxy for one optional private BABY_FOOD photo per Family Log record. */
export async function familyLogMediaApi(request:Request,context:AppContext):Promise<Response>{
  const s=scope(context);
  if(!s||!(await activeMember(context.env,s.familyId,s.memberId)))return json({ok:false,error:'AUTH_REQUIRED'},401);
  await reconcilePendingFamilyLogMedia(context.env,s.familyId,4).catch(()=>{});
  const url=new URL(request.url);

  if(request.method==='GET'){
    const mediaId=positiveId(url.searchParams.get('media'));
    if(mediaId){
      const row=await mediaById(context.env,s.familyId,mediaId,true);
      if(!row)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
      const mime=imageMime(row.mime_type);
      if(!mime)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
      try{
        const object=await context.env.MEDIA.get(String(row.storage_key));
        if(!object)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
        const headers=new Headers({'content-type':mime,'cache-control':'private, max-age=300','x-content-type-options':'nosniff'});
        const etag=object.httpEtag?String(object.httpEtag):'';
        if(etag)headers.set('etag',etag);
        if(matchesIfNoneMatch(request.headers.get('if-none-match'),etag))return new Response(null,{status:304,headers});
        return new Response(object.body,{status:200,headers});
      }catch{return json({ok:false,error:'MEDIA_READ_FAILED'},500);}
    }
    const logId=positiveId(url.searchParams.get('log'));
    if(!logId)return json({ok:false,error:'INVALID_MEDIA'},400);
    await reconcileFamilyLogMediaForLog(context.env,s.familyId,logId).catch(()=>{});
    const row=await mediaByLog(context.env,s.familyId,logId);
    return json({ok:true,media:row?publicMetadata(row):null});
  }

  const csrf=String(request.headers.get('x-csrf-token')||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);

  if(request.method==='POST'){
    const logId=positiveId(request.headers.get('x-family-log-id'));
    if(!logId)return json({ok:false,error:'INVALID_LOG'},400);
    const parent=await babyFoodParent(context.env,s.familyId,logId);
    if(!parent)return json({ok:false,error:'BABY_FOOD_LOG_NOT_FOUND'},404);
    await reconcileFamilyLogMediaForLog(context.env,s.familyId,logId).catch(()=>{});
    if(await mediaByLog(context.env,s.familyId,logId))return json({ok:false,error:'PHOTO_ALREADY_EXISTS'},409);
    const mime=imageMime(request.headers.get('content-type'));
    if(!mime)return json({ok:false,error:'UNSUPPORTED_IMAGE_TYPE'},415);
    const declared=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_IMAGE_BYTES)return json({ok:false,error:'FILE_TOO_LARGE'},413);
    try{
      const buffer=await readBoundedBody(request,MAX_IMAGE_BYTES);
      if(buffer===null)return json({ok:false,error:'FILE_TOO_LARGE'},413);
      if(buffer.byteLength<=0)return json({ok:false,error:'INVALID_IMAGE'},400);
      const bytes=new Uint8Array(buffer);
      if(!hasValidSignature(bytes,mime))return json({ok:false,error:'INVALID_IMAGE'},400);
      const objectKey=`families/${s.familyId}/family-log/subjects/${Number(parent.subject_id)}/logs/${logId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
      await queueObjectCleanup(context.env,s.familyId,objectKey,'ORPHAN');
      try{
        await context.env.MEDIA.put(objectKey,buffer,{httpMetadata:{contentType:mime}});
        const result=await context.env.DB.prepare(`INSERT INTO family_log_media(family_id,log_id,subject_id,storage_key,mime_type,byte_size,created_by,created_at,reconcile_pending)
          VALUES(?,?,?,?,?,?,?,?,0)`).bind(s.familyId,logId,Number(parent.subject_id),objectKey,mime,buffer.byteLength,s.memberId,new Date().toISOString()).run();
        await context.env.DB.prepare('DELETE FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=?').bind(s.familyId,objectKey).run();
        const row:MediaRow={id:Number(result.meta.last_row_id),log_id:logId,subject_id:Number(parent.subject_id),storage_key:objectKey,mime_type:mime,byte_size:buffer.byteLength,reconcile_pending:0};
        return json({ok:true,media:publicMetadata(row)},201);
      }catch(error){
        try{
          await context.env.MEDIA.delete(objectKey);
          await context.env.DB.prepare('DELETE FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=?').bind(s.familyId,objectKey).run();
        }catch{}
        if(await mediaByLog(context.env,s.familyId,logId))return json({ok:false,error:'PHOTO_ALREADY_EXISTS'},409);
        throw error;
      }
    }catch{return json({ok:false,error:'MEDIA_UPLOAD_FAILED'},500);}
  }

  if(request.method==='DELETE'){
    const mediaId=positiveId(url.searchParams.get('media'));
    if(!mediaId)return json({ok:false,error:'INVALID_MEDIA'},400);
    const row=await mediaById(context.env,s.familyId,mediaId,false);
    if(!row)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
    try{
      const deleted=await cleanupMediaRow(context.env,s.familyId,row);
      return deleted?json({ok:true}):json({ok:false,error:'MEDIA_DELETE_RETRY_PENDING'},503);
    }catch{return json({ok:false,error:'MEDIA_DELETE_FAILED'},500);}
  }

  return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
}

export const FAMILY_LOG_MEDIA_LIMITS={maxImageBytes:MAX_IMAGE_BYTES} as const;