import type {AppContext} from './app-context';
import {calendarStampManagedUploadObjectKey,normalizeCalendarStampStorageKey} from './calendar-stamp-storage';
import {json} from './response';

const MAX_PNG_BYTES=4*1024*1024;
const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] as const;

function scope(context:AppContext):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

async function activeMember(env:Env,familyId:number,memberId:number):Promise<boolean>{
  const row=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(memberId,familyId).first<{id:number}>();
  return Boolean(row);
}

async function activeAdmin(env:Env,familyId:number,memberId:number):Promise<boolean>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1").bind(memberId,familyId).first<{id:number}>();
  return Boolean(row);
}

function isPng(bytes:Uint8Array):boolean{
  return bytes.length>=PNG_SIGNATURE.length&&PNG_SIGNATURE.every((value,index)=>bytes[index]===value);
}

function positiveId(value:string|null):number|null{
  if(!value)return null;
  const id=Number(value);
  return Number.isSafeInteger(id)&&id>0?id:null;
}

async function referencedUploadKey(env:Env,familyId:number,assetId:number,url:URL):Promise<string|null>{
  const frameRaw=url.searchParams.get('frame');
  if(frameRaw!==null){
    const frameIndex=Number(frameRaw);
    if(!Number.isSafeInteger(frameIndex)||frameIndex<0||frameIndex>=48)return null;
    const row=await env.DB.prepare(`SELECT frame.storage_key
      FROM calendar_stamp_asset_frames frame
      JOIN calendar_stamp_assets asset ON asset.id=frame.asset_id AND asset.family_id=frame.family_id
      WHERE frame.family_id=? AND frame.asset_id=? AND frame.frame_index=?
        AND asset.active=1 AND asset.storage_provider='UPLOAD'
      LIMIT 1`).bind(familyId,assetId,frameIndex).first<{storage_key:string}>();
    return row?normalizeCalendarStampStorageKey(row.storage_key,'calendar stamp media key'):null;
  }
  const variant=url.searchParams.get('variant')==='thumbnail'?'thumbnail':'full';
  const row=await env.DB.prepare(`SELECT storage_key,thumbnail_storage_key
    FROM calendar_stamp_assets
    WHERE id=? AND family_id=? AND active=1 AND storage_provider='UPLOAD'
    LIMIT 1`).bind(assetId,familyId).first<{storage_key:string;thumbnail_storage_key:string|null}>();
  if(!row)return null;
  const key=variant==='thumbnail'&&row.thumbnail_storage_key?row.thumbnail_storage_key:row.storage_key;
  return normalizeCalendarStampStorageKey(key,'calendar stamp media key');
}

/** Authenticated same-family read proxy for R2-backed canonical stamp media. */
export async function calendarStampMediaReadApi(request:Request,context:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);
  const s=scope(context);if(!s||!(await activeMember(context.env,s.familyId,s.memberId)))return json({ok:false,error:'AUTH_REQUIRED'},401);
  const url=new URL(request.url),assetId=positiveId(url.searchParams.get('asset'));
  if(!assetId)return json({ok:false,error:'INVALID_MEDIA'},400);
  try{
    const storageKey=await referencedUploadKey(context.env,s.familyId,assetId,url);
    if(!storageKey)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
    const objectKey=calendarStampManagedUploadObjectKey(s.familyId,storageKey);
    const object=await context.env.MEDIA.get(objectKey);
    if(!object)return json({ok:false,error:'MEDIA_NOT_FOUND'},404);
    const headers=new Headers({'content-type':'image/png','cache-control':'private, max-age=300','x-content-type-options':'nosniff'});
    const contentType=String(object.httpMetadata?.contentType||'');
    if(contentType==='image/png')headers.set('content-type',contentType);
    if(object.etag)headers.set('etag',String(object.etag));
    return new Response(object.body,{status:200,headers});
  }catch{
    return json({ok:false,error:'MEDIA_READ_FAILED'},500);
  }
}

/** Admin-only raw PNG upload. Keys are generated server-side and remain backend-neutral in D1 metadata. */
export async function calendarStampMediaUploadApi(request:Request,context:AppContext):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(!(await activeAdmin(context.env,s.familyId,s.memberId)))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  const csrf=String(request.headers.get('x-csrf-token')||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  const contentType=String(request.headers.get('content-type')||'').split(';',1)[0]!.trim().toLowerCase();
  if(contentType!=='image/png')return json({ok:false,error:'PNG_REQUIRED'},415);
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_PNG_BYTES)return json({ok:false,error:'FILE_TOO_LARGE'},413);
  try{
    const buffer=await request.arrayBuffer();
    if(buffer.byteLength<PNG_SIGNATURE.length||buffer.byteLength>MAX_PNG_BYTES)return json({ok:false,error:buffer.byteLength>MAX_PNG_BYTES?'FILE_TOO_LARGE':'INVALID_PNG'},buffer.byteLength>MAX_PNG_BYTES?413:400);
    const bytes=new Uint8Array(buffer);
    if(!isPng(bytes))return json({ok:false,error:'INVALID_PNG'},400);
    const storageKey=`uploads/${crypto.randomUUID()}.png`;
    const objectKey=calendarStampManagedUploadObjectKey(s.familyId,storageKey);
    await context.env.MEDIA.put(objectKey,buffer,{httpMetadata:{contentType:'image/png'}});
    return json({ok:true,storageKey,bytes:buffer.byteLength},201);
  }catch{
    return json({ok:false,error:'MEDIA_UPLOAD_FAILED'},500);
  }
}

export const CALENDAR_STAMP_MEDIA_LIMITS={maxPngBytes:MAX_PNG_BYTES} as const;
