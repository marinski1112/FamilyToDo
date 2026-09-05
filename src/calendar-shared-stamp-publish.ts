import {
  FAMILY_SHARED_STAMP_MAX_EDGE,
  FAMILY_SHARED_STAMP_MAX_FRAMES,
  FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES,
  type FamilySharedStampCatalogItem,
  type FamilySharedStampManifest,
  createFamilySharedStampRegistryClient,
} from './calendar-shared-stamp-registry';
import {
  attachCalendarSharedStampRef,
  calendarSharedStampRefForAsset,
} from './calendar-shared-stamp-ref';
import {
  calendarStampManagedUploadObjectKey,
  normalizeCalendarStampStorageKey,
} from './calendar-stamp-storage';

const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] as const;
const MIN_FRAMES=2;
const MIN_DURATION_MS=40;
const MAX_DURATION_MS=2000;

type RegistryClient=ReturnType<typeof createFamilySharedStampRegistryClient>;

type PublishAsset={
  id:number;
  name:string;
  asset_kind:string;
  mime_type:string;
  storage_provider:string;
  active:number;
};

type PublishFrame={
  frame_index:number;
  storage_key:string;
  duration_ms:number;
};

type PreparedFrame={
  bytes:ArrayBuffer;
  durationMs:number;
  width:number;
  height:number;
  sha256:string;
};

export type CalendarSharedStampPublishResult={
  assetId:number;
  sharedStampId:string;
  sharedVersion:number;
  representation:'FRAME_SEQUENCE';
  reused:boolean;
};

export class CalendarSharedStampPublishIncompatibleError extends Error{
  constructor(){super('calendar shared stamp source incompatible');this.name='CalendarSharedStampPublishIncompatibleError';}
}

export class CalendarSharedStampPublishUpstreamError extends Error{
  constructor(){super('calendar shared stamp publish upstream failed');this.name='CalendarSharedStampPublishUpstreamError';}
}

function positiveId(value:number,label:string):number{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
  return value;
}

async function assertActiveAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp admin required');
}

async function sha256Hex(value:ArrayBuffer|Uint8Array):Promise<string>{
  const buffer:ArrayBuffer=value instanceof Uint8Array?new Uint8Array(value).buffer:value;
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function pngDimensions(bytes:ArrayBuffer):{width:number;height:number}{
  const data=new Uint8Array(bytes);
  if(data.byteLength<24||!PNG_SIGNATURE.every((value,index)=>data[index]===value))throw new CalendarSharedStampPublishIncompatibleError();
  const view=new DataView(bytes);
  if(view.getUint32(8)!==13||data[12]!==0x49||data[13]!==0x48||data[14]!==0x44||data[15]!==0x52)throw new CalendarSharedStampPublishIncompatibleError();
  const width=view.getUint32(16),height=view.getUint32(20);
  if(width<1||height<1||Math.max(width,height)>FAMILY_SHARED_STAMP_MAX_EDGE)throw new CalendarSharedStampPublishIncompatibleError();
  return {width,height};
}

function compatibleRemote(item:FamilySharedStampCatalogItem,expected:{
  sharedId:string;width:number;height:number;normalizedByteSize:number;
}):boolean{
  return item.sharedId===expected.sharedId
    &&item.currentVersion===1
    &&item.kind==='ANIMATED'
    &&item.representation==='FRAME_SEQUENCE'
    &&item.mimeType==='image/png'
    &&item.width===expected.width
    &&item.height===expected.height
    &&item.normalizedByteSize===expected.normalizedByteSize;
}

async function prepareFrames(env:Env,familyId:number,rows:PublishFrame[]):Promise<PreparedFrame[]>{
  if(rows.length<MIN_FRAMES||rows.length>FAMILY_SHARED_STAMP_MAX_FRAMES)throw new CalendarSharedStampPublishIncompatibleError();
  const prepared:PreparedFrame[]=[];
  let totalBytes=0;
  let commonWidth=0,commonHeight=0;
  for(let index=0;index<rows.length;index++){
    const row=rows[index]!;
    const durationMs=Number(row.duration_ms);
    if(Number(row.frame_index)!==index||!Number.isSafeInteger(durationMs)||durationMs<MIN_DURATION_MS||durationMs>MAX_DURATION_MS)throw new CalendarSharedStampPublishIncompatibleError();
    const storageKey=normalizeCalendarStampStorageKey(row.storage_key,`calendar shared stamp frame ${index}`);
    const object=await env.MEDIA.get(calendarStampManagedUploadObjectKey(familyId,storageKey));
    if(!object)throw new CalendarSharedStampPublishIncompatibleError();
    const bytes=await object.arrayBuffer();
    if(bytes.byteLength<1)throw new CalendarSharedStampPublishIncompatibleError();
    totalBytes+=bytes.byteLength;
    if(totalBytes>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new CalendarSharedStampPublishIncompatibleError();
    const {width,height}=pngDimensions(bytes);
    if(index===0){commonWidth=width;commonHeight=height;}
    else if(width!==commonWidth||height!==commonHeight)throw new CalendarSharedStampPublishIncompatibleError();
    prepared.push({bytes,durationMs,width,height,sha256:await sha256Hex(bytes)});
  }
  return prepared;
}

async function sequenceSharedId(frames:PreparedFrame[]):Promise<string>{
  const descriptor=frames.map((frame,index)=>`${index}:${frame.sha256}:${frame.durationMs}:${frame.width}x${frame.height}`).join('|');
  const digest=await sha256Hex(new TextEncoder().encode(descriptor));
  return `ft-${digest.slice(0,40)}`;
}

function result(assetId:number,sharedStampId:string,reused:boolean):CalendarSharedStampPublishResult{
  return {assetId,sharedStampId,sharedVersion:1,representation:'FRAME_SEQUENCE',reused};
}

/**
 * Publishes one existing FamilyToDo-managed PNG sequence to the cross-app registry.
 * The browser never receives the registry write token or private MEDIA keys. Source
 * bytes are re-read from the authenticated family namespace and validated against
 * the 384px / 1MiB shared contract before any remote write occurs. Actual PNG IHDR
 * dimensions are authoritative, so stale optional local display metadata cannot
 * permanently block a valid normalized upload from being shared.
 */
export async function publishCalendarStampToShared(
  env:Env,
  familyId:number,
  memberId:number,
  assetId:number,
  client:RegistryClient,
):Promise<CalendarSharedStampPublishResult>{
  positiveId(familyId,'calendar stamp family');
  positiveId(memberId,'calendar stamp member');
  positiveId(assetId,'calendar stamp asset');
  await assertActiveAdmin(env,familyId,memberId);

  // This preflight intentionally touches the 0054 table before any shared-service
  // write. If the projection migration is not present, publication fails locally
  // instead of creating an unattachable remote catalog entry.
  const existingRef=await calendarSharedStampRefForAsset(env,familyId,memberId,assetId);
  if(existingRef){
    if(existingRef.representation!=='FRAME_SEQUENCE')throw new CalendarSharedStampPublishIncompatibleError();
    return result(assetId,existingRef.shared_stamp_id,true);
  }

  const asset=await env.DB.prepare(`SELECT id,name,asset_kind,mime_type,storage_provider,active
    FROM calendar_stamp_assets WHERE id=? AND family_id=? LIMIT 1`)
    .bind(assetId,familyId).first<PublishAsset>();
  if(!asset)return Promise.reject(new Error('calendar shared stamp asset unavailable'));
  if(Number(asset.active)!==1||asset.asset_kind!=='ANIMATED'||asset.mime_type!=='image/png'||asset.storage_provider!=='UPLOAD')throw new CalendarSharedStampPublishIncompatibleError();

  const frameRows=await env.DB.prepare(`SELECT frame_index,storage_key,duration_ms
    FROM calendar_stamp_asset_frames
    WHERE family_id=? AND asset_id=?
    ORDER BY frame_index`)
    .bind(familyId,assetId).all<PublishFrame>();
  const frames=await prepareFrames(env,familyId,frameRows.results);
  const width=frames[0]!.width,height=frames[0]!.height;
  const normalizedByteSize=frames.reduce((sum,frame)=>sum+frame.bytes.byteLength,0);
  const sharedStampId=await sequenceSharedId(frames);
  const expected={sharedId:sharedStampId,width,height,normalizedByteSize};

  let remote:FamilySharedStampCatalogItem|null=await client.get(sharedStampId);
  let reused=Boolean(remote);
  if(remote&&!compatibleRemote(remote,expected))throw new CalendarSharedStampPublishUpstreamError();

  if(!remote){
    const nonce=crypto.randomUUID().replaceAll('-','');
    const manifestFrames=frames.map((frame,index)=>({
      storageKey:`stamps/${sharedStampId}/v1/${nonce}/frame-${String(index).padStart(2,'0')}.png`,
      durationMs:frame.durationMs,
      width:frame.width,
      height:frame.height,
    }));
    const manifest:FamilySharedStampManifest={
      sharedId:sharedStampId,
      version:1,
      name:String(asset.name||'').trim(),
      kind:'ANIMATED',
      representation:'FRAME_SEQUENCE',
      mimeType:'image/png',
      storageKey:null,
      thumbnailStorageKey:null,
      width,
      height,
      normalizedByteSize,
      frames:manifestFrames,
    };
    const files=frames.map((frame,index)=>new File([frame.bytes],`frame-${String(index).padStart(2,'0')}.png`,{type:'image/png'}));
    try{
      await client.create(manifest,{frames:files});
    }catch{
      // A concurrent publisher of identical content derives the same shared id.
      // Re-read the public immutable catalog and accept only an exact contract match.
      reused=true;
    }
    remote=await client.get(sharedStampId);
    if(!remote||!compatibleRemote(remote,expected))throw new CalendarSharedStampPublishUpstreamError();
  }

  try{
    await attachCalendarSharedStampRef(env,familyId,memberId,assetId,{
      sharedStampId,
      sharedVersion:1,
      representation:'FRAME_SEQUENCE',
    });
  }catch{
    const raced=await calendarSharedStampRefForAsset(env,familyId,memberId,assetId);
    if(!raced||raced.shared_stamp_id!==sharedStampId||Number(raced.shared_version)!==1||raced.representation!=='FRAME_SEQUENCE')throw new CalendarSharedStampPublishUpstreamError();
    reused=true;
  }
  return result(assetId,sharedStampId,reused);
}