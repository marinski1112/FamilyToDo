import { registerCalendarStampAsset } from './calendar-stamp-actions';
import { registerCalendarStampPngSequence } from './calendar-stamp-png-sequence-actions';
import {
  FAMILY_SHARED_STAMP_MAX_EDGE,
  FAMILY_SHARED_STAMP_MAX_FRAMES,
  FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES,
  type FamilySharedStampCatalogItem,
  type FamilySharedStampMimeType,
  type FamilySharedStampRepresentation,
  createFamilySharedStampRegistryClient,
} from './calendar-shared-stamp-registry';
import {
  attachCalendarSharedStampRef,
  normalizeCalendarSharedStampId,
  normalizeCalendarSharedStampVersion,
} from './calendar-shared-stamp-ref';
import { calendarStampManagedUploadObjectKey } from './calendar-stamp-storage';

const MIN_FRAME_DURATION_MS=40;
const MAX_FRAME_DURATION_MS=2000;
const LOCAL_SINGLE_FILE_MIME_TYPES=new Set<FamilySharedStampMimeType>(['image/png','image/webp','image/gif']);

type RegistryClient=ReturnType<typeof createFamilySharedStampRegistryClient>;
type ExistingProjection={asset_id:number;active:number};
type SharedFrame={frameIndex:number;durationMs:number;width:number;height:number;byteSize:number;contentPath:string};

type MaterializedSharedStamp={
  assetId:number;
  sharedStampId:string;
  sharedVersion:number;
  representation:FamilySharedStampRepresentation;
  reused:boolean;
};

function positiveId(value:number,label:string):number{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
  return value;
}

async function assertActiveAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp admin required');
}

async function existingProjection(env:Env,familyId:number,sharedStampId:string,sharedVersion:number):Promise<ExistingProjection|null>{
  const row=await env.DB.prepare(`SELECT ref.asset_id,asset.active
    FROM calendar_shared_stamp_refs ref
    JOIN calendar_stamp_assets asset ON asset.id=ref.asset_id AND asset.family_id=ref.family_id
    WHERE ref.family_id=? AND ref.shared_stamp_id=? AND ref.shared_version=?
    LIMIT 1`).bind(familyId,sharedStampId,sharedVersion).first<ExistingProjection>();
  return row??null;
}

function localName(value:string):string{
  return Array.from(value.trim()).slice(0,80).join('');
}

function singleFileExtension(mimeType:FamilySharedStampMimeType):string{
  if(mimeType==='image/png')return 'png';
  if(mimeType==='image/webp')return 'webp';
  if(mimeType==='image/gif')return 'gif';
  throw new Error('calendar shared stamp mime unsupported');
}

function normalizedContentType(value:string|null):string{
  return String(value||'').split(';',1)[0]!.trim().toLowerCase();
}

async function boundedImageBytes(
  response:Response,
  expectedMime:string,
  maxBytes:number,
):Promise<ArrayBuffer>{
  if(!response.ok)throw new Error('calendar shared stamp upstream media unavailable');
  const contentType=normalizedContentType(response.headers.get('content-type'));
  if(contentType!==expectedMime)throw new Error('calendar shared stamp upstream mime mismatch');
  const declared=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error('calendar shared stamp upstream media too large');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<1||bytes.byteLength>maxBytes)throw new Error('calendar shared stamp upstream media too large');
  return bytes;
}

async function putManagedMedia(env:Env,familyId:number,storageKey:string,bytes:ArrayBuffer,mimeType:string):Promise<void>{
  await env.MEDIA.put(calendarStampManagedUploadObjectKey(familyId,storageKey),bytes,{httpMetadata:{contentType:mimeType}});
}

function parseFramesManifest(value:unknown,item:FamilySharedStampCatalogItem):SharedFrame[]{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('calendar shared stamp frames response invalid');
  const body=value as Record<string,unknown>;
  if(body.sharedId!==item.sharedId||Number(body.version)!==item.currentVersion||!Array.isArray(body.frames))throw new Error('calendar shared stamp frames response invalid');
  if(body.frames.length<2||body.frames.length>FAMILY_SHARED_STAMP_MAX_FRAMES)throw new Error('calendar shared stamp frame count invalid');
  let totalBytes=0;
  const prefix=`/v1/stamps/${item.sharedId}/versions/${item.currentVersion}/frames/`;
  return body.frames.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('calendar shared stamp frame invalid');
    const frame=raw as Record<string,unknown>;
    const frameIndex=Number(frame.frameIndex),durationMs=Number(frame.durationMs),width=Number(frame.width),height=Number(frame.height),byteSize=Number(frame.byteSize),contentPath=String(frame.contentPath||'');
    if(frameIndex!==index||!Number.isSafeInteger(durationMs)||durationMs<MIN_FRAME_DURATION_MS||durationMs>MAX_FRAME_DURATION_MS)throw new Error('calendar shared stamp frame invalid');
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,height)>FAMILY_SHARED_STAMP_MAX_EDGE)throw new Error('calendar shared stamp frame dimensions invalid');
    if(!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new Error('calendar shared stamp frame size invalid');
    if(contentPath!==`${prefix}${index}`)throw new Error('calendar shared stamp frame path invalid');
    totalBytes+=byteSize;
    if(totalBytes>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new Error('calendar shared stamp frame budget exceeded');
    return {frameIndex,durationMs,width,height,byteSize,contentPath};
  });
}

async function fetchFrames(client:RegistryClient,item:FamilySharedStampCatalogItem,fetchImpl:typeof fetch):Promise<SharedFrame[]>{
  if(!item.framesPath)throw new Error('calendar shared stamp frames unavailable');
  const response=await fetchImpl(client.publicUrl(item.framesPath),{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error('calendar shared stamp upstream frames unavailable');
  const body:unknown=await response.json().catch(()=>null);
  return parseFramesManifest(body,item);
}

async function materializeSingleFile(
  env:Env,
  familyId:number,
  memberId:number,
  client:RegistryClient,
  item:FamilySharedStampCatalogItem,
  fetchImpl:typeof fetch,
):Promise<number>{
  if(!LOCAL_SINGLE_FILE_MIME_TYPES.has(item.mimeType)||!item.contentPath)throw new Error('calendar shared stamp mime unsupported');
  const extension=singleFileExtension(item.mimeType);
  const storageKey=`shared/${item.sharedId}/v${item.currentVersion}/content.${extension}`;
  const response=await fetchImpl(client.publicUrl(item.contentPath),{headers:{accept:item.mimeType}});
  const bytes=await boundedImageBytes(response,item.mimeType,FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES);
  if(bytes.byteLength!==item.normalizedByteSize)throw new Error('calendar shared stamp byte size mismatch');
  await putManagedMedia(env,familyId,storageKey,bytes,item.mimeType);
  return registerCalendarStampAsset(env,familyId,memberId,{
    name:localName(item.name),
    assetKind:item.kind,
    mimeType:item.mimeType as 'image/png'|'image/webp'|'image/gif',
    storageProvider:'UPLOAD',
    storageKey,
    thumbnailStorageKey:storageKey,
    width:item.width,
    height:item.height,
  });
}

async function materializeFrameSequence(
  env:Env,
  familyId:number,
  memberId:number,
  client:RegistryClient,
  item:FamilySharedStampCatalogItem,
  fetchImpl:typeof fetch,
):Promise<number>{
  if(item.mimeType!=='image/png'||item.representation!=='FRAME_SEQUENCE')throw new Error('calendar shared stamp frame mime unsupported');
  const frames=await fetchFrames(client,item,fetchImpl);
  const localFrames:Array<{storageKey:string;durationMs:number}>=[];
  let downloadedBytes=0;
  for(const frame of frames){
    const storageKey=`shared/${item.sharedId}/v${item.currentVersion}/frame-${String(frame.frameIndex).padStart(2,'0')}.png`;
    const response=await fetchImpl(client.publicUrl(frame.contentPath),{headers:{accept:'image/png'}});
    const bytes=await boundedImageBytes(response,'image/png',Math.min(frame.byteSize,FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES));
    if(bytes.byteLength!==frame.byteSize)throw new Error('calendar shared stamp frame byte size mismatch');
    downloadedBytes+=bytes.byteLength;
    if(downloadedBytes>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new Error('calendar shared stamp frame budget exceeded');
    await putManagedMedia(env,familyId,storageKey,bytes,'image/png');
    localFrames.push({storageKey,durationMs:frame.durationMs});
  }
  if(downloadedBytes!==item.normalizedByteSize)throw new Error('calendar shared stamp byte size mismatch');
  return registerCalendarStampPngSequence(env,familyId,memberId,{
    name:localName(item.name),
    storageProvider:'UPLOAD',
    frames:localFrames,
    width:item.width,
    height:item.height,
  });
}

/**
 * Copy one trusted immutable shared version into the existing family-local stamp
 * transport. Placements continue to reference the local asset id, while 0054
 * records the immutable shared identity/version. No shared credential or R2 key is
 * persisted in FamilyToDo D1.
 */
export async function materializeCalendarSharedStamp(
  env:Env,
  familyId:number,
  memberId:number,
  client:RegistryClient,
  sharedStampIdInput:unknown,
  sharedVersionInput:unknown,
  fetchImpl:typeof fetch=fetch,
):Promise<MaterializedSharedStamp>{
  positiveId(familyId,'calendar stamp family');
  positiveId(memberId,'calendar stamp member');
  const sharedStampId=normalizeCalendarSharedStampId(sharedStampIdInput);
  const sharedVersion=normalizeCalendarSharedStampVersion(sharedVersionInput);
  await assertActiveAdmin(env,familyId,memberId);

  const existing=await existingProjection(env,familyId,sharedStampId,sharedVersion);
  if(existing){
    if(Number(existing.active)!==1)throw new Error('calendar shared stamp projection disabled');
    return {assetId:Number(existing.asset_id),sharedStampId,sharedVersion,representation:'SINGLE_FILE',reused:true};
  }

  const catalog=await client.list();
  const item=catalog.find(candidate=>candidate.sharedId===sharedStampId&&candidate.currentVersion===sharedVersion);
  if(!item)throw new Error('calendar shared stamp unavailable');
  if(item.width<1||item.height<1||Math.max(item.width,item.height)>FAMILY_SHARED_STAMP_MAX_EDGE||item.normalizedByteSize<1||item.normalizedByteSize>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new Error('calendar shared stamp bounds invalid');

  const assetId=item.representation==='SINGLE_FILE'
    ?await materializeSingleFile(env,familyId,memberId,client,item,fetchImpl)
    :await materializeFrameSequence(env,familyId,memberId,client,item,fetchImpl);
  try{
    await attachCalendarSharedStampRef(env,familyId,memberId,assetId,{
      sharedStampId,
      sharedVersion,
      representation:item.representation,
    });
  }catch(error){
    const raced=await existingProjection(env,familyId,sharedStampId,sharedVersion);
    if(!raced||Number(raced.active)!==1)throw error;
    return {assetId:Number(raced.asset_id),sharedStampId,sharedVersion,representation:item.representation,reused:true};
  }
  return {assetId,sharedStampId,sharedVersion,representation:item.representation,reused:false};
}
