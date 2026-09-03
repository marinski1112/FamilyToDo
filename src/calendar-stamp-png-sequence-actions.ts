import { utcNow } from './timezone';

export type CalendarStampPngFrameInput={storageKey:string;durationMs?:number};
export type CalendarStampPngSequenceInput={
  name:string;
  storageProvider:'ASSETS'|'UPLOAD';
  frames:CalendarStampPngFrameInput[];
  thumbnailStorageKey?:string|null;
  width?:number|null;
  height?:number|null;
};

const MAX_NAME_LENGTH=80;
const MAX_STORAGE_KEY_LENGTH=512;
const MIN_FRAMES=2;
const MAX_FRAMES=48;
const MIN_DURATION_MS=40;
const MAX_DURATION_MS=2000;
const DEFAULT_DURATION_MS=120;

function positiveId(value:number,label:string):void{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
}

function storageKey(value:unknown,label:string):string{
  const key=String(value??'').trim();
  if(!key||key.length>MAX_STORAGE_KEY_LENGTH)throw new Error(`invalid ${label}`);
  const lower=key.toLowerCase();
  if(lower.startsWith('data:')||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(key)||key.includes('://')||/[\u0000-\u001f\u007f]/.test(key))throw new Error(`invalid ${label}`);
  const normalized=key.replaceAll('\\','/');
  if(normalized.startsWith('//')||normalized.split('/').some(segment=>segment==='..'))throw new Error(`invalid ${label}`);
  return key;
}

function dimension(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>4096)throw new Error('invalid calendar stamp dimensions');
  return n;
}

async function assertAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const actor=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  if(!actor)throw new Error('calendar stamp admin required');
}

/**
 * Registers metadata for a pre-provisioned sequence of PNG files.
 * The first frame is the canonical asset key and default thumbnail. No binary bytes,
 * remote URLs, or storage credentials enter this domain action.
 */
export async function registerCalendarStampPngSequence(
  env:Env,
  familyId:number,
  memberId:number,
  input:CalendarStampPngSequenceInput,
):Promise<number>{
  positiveId(familyId,'calendar stamp family');
  positiveId(memberId,'calendar stamp member');
  await assertAdmin(env,familyId,memberId);
  const name=String(input.name??'').trim();
  if(!name||Array.from(name).length>MAX_NAME_LENGTH)throw new Error('invalid calendar stamp name');
  const provider=input.storageProvider==='ASSETS'?'ASSETS':input.storageProvider==='UPLOAD'?'UPLOAD':null;
  if(!provider)throw new Error('invalid calendar stamp storage provider');
  if(!Array.isArray(input.frames)||input.frames.length<MIN_FRAMES||input.frames.length>MAX_FRAMES)throw new Error('invalid calendar stamp PNG frame count');
  const frames=input.frames.map((frame,index)=>{
    const key=storageKey(frame?.storageKey,`calendar stamp PNG frame ${index}`);
    const raw=frame?.durationMs??DEFAULT_DURATION_MS;
    const durationMs=Number(raw);
    if(!Number.isSafeInteger(durationMs)||durationMs<MIN_DURATION_MS||durationMs>MAX_DURATION_MS)throw new Error('invalid calendar stamp PNG frame duration');
    return {storageKey:key,durationMs};
  });
  if(new Set(frames.map(frame=>frame.storageKey)).size!==frames.length)throw new Error('duplicate calendar stamp PNG frame key');
  const firstKey=frames[0]!.storageKey;
  const thumbnail=input.thumbnailStorageKey==null||String(input.thumbnailStorageKey).trim()===''?firstKey:storageKey(input.thumbnailStorageKey,'calendar stamp thumbnail key');
  const width=dimension(input.width),height=dimension(input.height);
  if((width===null)!==(height===null))throw new Error('calendar stamp dimensions must be paired');

  const now=utcNow();
  const result=await env.DB.prepare(`INSERT INTO calendar_stamp_assets(
      family_id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height,active,created_by,created_at,updated_at
    ) VALUES(?,?,'ANIMATED','image/png',?,?,?,?,?,1,?,?,?)
    ON CONFLICT(family_id,storage_provider,storage_key) DO UPDATE SET
      name=excluded.name,asset_kind='ANIMATED',mime_type='image/png',thumbnail_storage_key=excluded.thumbnail_storage_key,
      width=excluded.width,height=excluded.height,active=1,updated_at=excluded.updated_at`)
    .bind(familyId,name,provider,firstKey,thumbnail,width,height,memberId,now,now).run();
  if(Number(result.meta.changes||0)!==1)throw new Error('calendar stamp PNG sequence registration failed');
  const asset=await env.DB.prepare('SELECT id FROM calendar_stamp_assets WHERE family_id=? AND storage_provider=? AND storage_key=? LIMIT 1')
    .bind(familyId,provider,firstKey).first<{id:number}>();
  if(!asset)throw new Error('calendar stamp PNG sequence registration failed');
  const assetId=Number(asset.id);
  positiveId(assetId,'calendar stamp asset');

  const statements:D1PreparedStatement[]=[env.DB.prepare('DELETE FROM calendar_stamp_asset_frames WHERE family_id=? AND asset_id=?').bind(familyId,assetId)];
  for(let index=0;index<frames.length;index++){
    const frame=frames[index]!;
    statements.push(env.DB.prepare(`INSERT INTO calendar_stamp_asset_frames(family_id,asset_id,frame_index,storage_key,duration_ms,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).bind(familyId,assetId,index,frame.storageKey,frame.durationMs,now,now));
  }
  await env.DB.batch(statements);
  return assetId;
}

export const CALENDAR_STAMP_PNG_SEQUENCE_LIMITS={minFrames:MIN_FRAMES,maxFrames:MAX_FRAMES,minDurationMs:MIN_DURATION_MS,maxDurationMs:MAX_DURATION_MS,defaultDurationMs:DEFAULT_DURATION_MS} as const;
