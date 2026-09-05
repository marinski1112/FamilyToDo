import type {AppContext} from './app-context';
import {json} from './response';

const MAX_IMAGE_BYTES=4*1024*1024;
type FamilyLogImageMime='image/jpeg'|'image/png'|'image/webp';
type Scope={familyId:number;memberId:number};
type MediaRow={id:number;log_id:number;subject_id:number;storage_key:string;mime_type:string;byte_size:number};

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

async function mediaById(env:Env,familyId:number,mediaId:number,requireVisibleParent:boolean):Promise<MediaRow|null>{
  const parentClause=requireVisibleParent?' AND l.deleted_at IS NULL':'';
  return await env.DB.prepare(`SELECT m.id,m.log_id,m.subject_id,m.storage_key,m.mime_type,m.byte_size
    FROM family_log_media m
    JOIN family_logs l ON l.id=m.log_id AND l.family_id=m.family_id AND l.subject_id=m.subject_id${parentClause}
    WHERE m.id=? AND m.family_id=? LIMIT 1`).bind(mediaId,familyId).first<MediaRow>()||null;
}

async function mediaByLog(env:Env,familyId:number,logId:number):Promise<MediaRow|null>{
  return await env.DB.prepare(`SELECT m.id,m.log_id,m.subject_id,m.storage_key,m.mime_type,m.byte_size
    FROM family_log_media m
    JOIN family_logs l ON l.id=m.log_id AND l.family_id=m.family_id AND l.subject_id=m.subject_id AND l.deleted_at IS NULL
    WHERE m.log_id=? AND m.family_id=? LIMIT 1`).bind(logId,familyId).first<MediaRow>()||null;
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

/** Remove the private object and its metadata after the canonical Family Log soft-delete succeeds. */
export async function cleanupFamilyLogMediaForLog(env:Env,familyId:number,logId:number):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(logId)||logId<=0)return;
  const row=await env.DB.prepare('SELECT id,storage_key FROM family_log_media WHERE family_id=? AND log_id=? LIMIT 1').bind(familyId,logId).first<{id:number;storage_key:string}>();
  if(!row)return;
  await env.MEDIA.delete(String(row.storage_key));
  await env.DB.prepare('DELETE FROM family_log_media WHERE id=? AND family_id=?').bind(Number(row.id),familyId).run();
}

/** Authenticated same-family proxy for one optional private BABY_FOOD photo per Family Log record. */
export async function familyLogMediaApi(request:Request,context:AppContext):Promise<Response>{
  const s=scope(context);
  if(!s||!(await activeMember(context.env,s.familyId,s.memberId)))return json({ok:false,error:'AUTH_REQUIRED'},401);
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
    if(await mediaByLog(context.env,s.familyId,logId))return json({ok:false,error:'PHOTO_ALREADY_EXISTS'},409);
    const mime=imageMime(request.headers.get('content-type'));
    if(!mime)return json({ok:false,error:'UNSUPPORTED_IMAGE_TYPE'},415);
    const declared=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_IMAGE_BYTES)return json({ok:false,error:'FILE_TOO_LARGE'},413);
    let objectKey='';
    try{
      const buffer=await request.arrayBuffer();
      if(buffer.byteLength<=0||buffer.byteLength>MAX_IMAGE_BYTES)return json({ok:false,error:buffer.byteLength>MAX_IMAGE_BYTES?'FILE_TOO_LARGE':'INVALID_IMAGE'},buffer.byteLength>MAX_IMAGE_BYTES?413:400);
      const bytes=new Uint8Array(buffer);
      if(!hasValidSignature(bytes,mime))return json({ok:false,error:'INVALID_IMAGE'},400);
      objectKey=`families/${s.familyId}/family-log/subjects/${Number(parent.subject_id)}/logs/${logId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
      await context.env.MEDIA.put(objectKey,buffer,{httpMetadata:{contentType:mime}});
      try{
        const result=await context.env.DB.prepare(`INSERT INTO family_log_media(family_id,log_id,subject_id,storage_key,mime_type,byte_size,created_by,created_at)
          VALUES(?,?,?,?,?,?,?,?)`).bind(s.familyId,logId,Number(parent.subject_id),objectKey,mime,buffer.byteLength,s.memberId,new Date().toISOString()).run();
        const row:MediaRow={id:Number(result.meta.last_row_id),log_id:logId,subject_id:Number(parent.subject_id),storage_key:objectKey,mime_type:mime,byte_size:buffer.byteLength};
        return json({ok:true,media:publicMetadata(row)},201);
      }catch(error){
        await context.env.MEDIA.delete(objectKey).catch(()=>{});
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
      await context.env.MEDIA.delete(String(row.storage_key));
      await context.env.DB.prepare('DELETE FROM family_log_media WHERE id=? AND family_id=?').bind(mediaId,s.familyId).run();
      return json({ok:true});
    }catch{return json({ok:false,error:'MEDIA_DELETE_FAILED'},500);}
  }

  return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
}

export const FAMILY_LOG_MEDIA_LIMITS={maxImageBytes:MAX_IMAGE_BYTES} as const;
