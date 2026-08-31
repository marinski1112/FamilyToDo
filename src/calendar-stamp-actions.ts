import { utcNow } from './timezone';

export type CalendarStampAssetOption = {
  id: number;
  name: string;
  asset_kind: 'ANIMATED' | 'STATIC';
  mime_type: 'image/gif' | 'image/webp' | 'image/png';
  storage_provider: 'ASSETS' | 'UPLOAD';
  storage_key: string;
  thumbnail_storage_key: string | null;
  width: number | null;
  height: number | null;
};

export type CalendarStampAssetRegistrationInput = {
  name: string;
  assetKind: 'ANIMATED' | 'STATIC';
  mimeType: 'image/gif' | 'image/webp' | 'image/png';
  storageProvider: 'ASSETS' | 'UPLOAD';
  storageKey: string;
  thumbnailStorageKey?: string | null;
  width?: number | null;
  height?: number | null;
};

export type CalendarStampPlacementInput = {
  assetId: number;
  stampDate: string;
  visibilityScope?: 'FAMILY' | 'PRIVATE';
  sortOrder?: number;
};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_ASSET_OPTIONS=64;
const MAX_ASSET_NAME_LENGTH=80;
const MAX_STORAGE_KEY_LENGTH=512;
const MIN_SORT_ORDER=-1000;
const MAX_SORT_ORDER=1000;

function assertPositiveId(value:number,label:string):void{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
}

function assertCalendarDate(value:string):void{
  if(!DATE_RE.test(value))throw new Error('invalid calendar stamp date');
  const ms=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw new Error('invalid calendar stamp date');
}

function normalizedStorageKey(value:unknown,label:string):string{
  const key=String(value??'').trim();
  if(!key||key.length>MAX_STORAGE_KEY_LENGTH)throw new Error(`invalid ${label}`);
  const lower=key.toLowerCase();
  if(lower.startsWith('data:')||key.includes('://')||/[\u0000-\u001f\u007f]/.test(key))throw new Error(`invalid ${label}`);
  const slashNormalized=key.replaceAll('\\','/');
  if(slashNormalized.startsWith('//'))throw new Error(`invalid ${label}`);
  const segments=slashNormalized.split('/');
  if(segments.some(segment=>segment==='..'))throw new Error(`invalid ${label}`);
  return key;
}

function normalizedDimension(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>4096)throw new Error('invalid calendar stamp dimensions');
  return n;
}

async function assertActiveMember(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp member unavailable');
}

async function assertActiveAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1").bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp admin required');
}

export async function calendarStampAssetsForPicker(env:Env,familyId:number,memberId:number,limit=MAX_ASSET_OPTIONS):Promise<CalendarStampAssetOption[]>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  await assertActiveMember(env,familyId,memberId);
  const boundedLimit=Math.max(1,Math.min(MAX_ASSET_OPTIONS,Math.trunc(Number(limit)||MAX_ASSET_OPTIONS)));
  const rows=await env.DB.prepare(`SELECT id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height
    FROM calendar_stamp_assets
    WHERE family_id=? AND active=1
    ORDER BY id
    LIMIT ?`).bind(familyId,boundedLimit).all<CalendarStampAssetOption>();
  return rows.results;
}

/**
 * Registers metadata for an already-provisioned stamp asset. This function never
 * accepts bytes or remote URLs; upload/static asset transport remains a separate
 * infrastructure concern. Re-registering the same family/provider/key updates
 * bounded metadata and reactivates the asset without changing its creator.
 */
export async function registerCalendarStampAsset(
  env:Env,
  familyId:number,
  memberId:number,
  input:CalendarStampAssetRegistrationInput,
):Promise<number>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  await assertActiveAdmin(env,familyId,memberId);

  const name=String(input.name??'').trim();
  if(!name||Array.from(name).length>MAX_ASSET_NAME_LENGTH)throw new Error('invalid calendar stamp name');
  const assetKind=input.assetKind==='ANIMATED'?'ANIMATED':input.assetKind==='STATIC'?'STATIC':null;
  if(!assetKind)throw new Error('invalid calendar stamp asset kind');
  const mimeType=['image/gif','image/webp','image/png'].includes(String(input.mimeType))?input.mimeType:null;
  if(!mimeType)throw new Error('invalid calendar stamp mime type');
  if(assetKind==='ANIMATED'&&mimeType==='image/png')throw new Error('invalid animated calendar stamp mime type');
  const storageProvider=input.storageProvider==='ASSETS'?'ASSETS':input.storageProvider==='UPLOAD'?'UPLOAD':null;
  if(!storageProvider)throw new Error('invalid calendar stamp storage provider');
  const storageKey=normalizedStorageKey(input.storageKey,'calendar stamp storage key');
  const thumbnailStorageKey=input.thumbnailStorageKey==null||String(input.thumbnailStorageKey).trim()===''?null:normalizedStorageKey(input.thumbnailStorageKey,'calendar stamp thumbnail key');
  const width=normalizedDimension(input.width),height=normalizedDimension(input.height);
  if((width===null)!==(height===null))throw new Error('calendar stamp dimensions must be paired');

  const now=utcNow();
  await env.DB.prepare(`INSERT INTO calendar_stamp_assets(
      family_id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height,active,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)
    ON CONFLICT(family_id,storage_provider,storage_key) DO UPDATE SET
      name=excluded.name,
      asset_kind=excluded.asset_kind,
      mime_type=excluded.mime_type,
      thumbnail_storage_key=excluded.thumbnail_storage_key,
      width=excluded.width,
      height=excluded.height,
      active=1,
      updated_at=excluded.updated_at`).bind(familyId,name,assetKind,mimeType,storageProvider,storageKey,thumbnailStorageKey,width,height,memberId,now,now).run();
  const asset=await env.DB.prepare('SELECT id FROM calendar_stamp_assets WHERE family_id=? AND storage_provider=? AND storage_key=? LIMIT 1').bind(familyId,storageProvider,storageKey).first<{id:number}>();
  if(!asset)throw new Error('calendar stamp registration failed');
  return Number(asset.id);
}

/** Admin-only soft-disable; placements remain intact and disappear via active asset filtering. */
export async function setCalendarStampAssetActive(env:Env,familyId:number,memberId:number,assetId:number,active:boolean):Promise<boolean>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  assertPositiveId(assetId,'calendar stamp asset');
  await assertActiveAdmin(env,familyId,memberId);
  const result=await env.DB.prepare('UPDATE calendar_stamp_assets SET active=?,updated_at=? WHERE id=? AND family_id=?').bind(active?1:0,utcNow(),assetId,familyId).run();
  return Number(result.meta.changes||0)>0;
}

/**
 * Creates a placement only for an authenticated active member in the same family.
 * PRIVATE placements are always owned by the acting member; callers cannot name a
 * different private owner. Asset contents/URLs are never accepted by this action.
 */
export async function createCalendarStampPlacement(
  env:Env,
  familyId:number,
  memberId:number,
  input:CalendarStampPlacementInput,
):Promise<number>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  assertPositiveId(input.assetId,'calendar stamp asset');
  assertCalendarDate(input.stampDate);
  const visibility=input.visibilityScope==='PRIVATE'?'PRIVATE':'FAMILY';
  const sortOrder=Math.trunc(Number(input.sortOrder)||0);
  if(sortOrder<MIN_SORT_ORDER||sortOrder>MAX_SORT_ORDER)throw new Error('invalid calendar stamp sort order');

  await assertActiveMember(env,familyId,memberId);
  const now=utcNow();
  const result=await env.DB.prepare(`INSERT INTO calendar_stamp_placements(
      family_id,asset_id,stamp_date,visibility_scope,private_owner_id,sort_order,created_by,created_at,updated_at
    )
    SELECT ?,asset.id,?,?,?,?,?,?,?
    FROM calendar_stamp_assets asset
    WHERE asset.id=? AND asset.family_id=? AND asset.active=1`)
    .bind(familyId,input.stampDate,visibility,visibility==='PRIVATE'?memberId:null,sortOrder,memberId,now,now,input.assetId,familyId).run();
  if(Number(result.meta.changes||0)!==1)throw new Error('calendar stamp asset unavailable');
  return Number(result.meta.last_row_id);
}

/** Creator-only removal is the conservative default until an explicit admin policy is wired. */
export async function deleteCalendarStampPlacement(env:Env,familyId:number,memberId:number,placementId:number):Promise<boolean>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  assertPositiveId(placementId,'calendar stamp placement');
  await assertActiveMember(env,familyId,memberId);
  const result=await env.DB.prepare('DELETE FROM calendar_stamp_placements WHERE id=? AND family_id=? AND created_by=?').bind(placementId,familyId,memberId).run();
  return Number(result.meta.changes||0)>0;
}

export const CALENDAR_STAMP_ACTION_LIMITS={maxAssetOptions:MAX_ASSET_OPTIONS,maxAssetNameLength:MAX_ASSET_NAME_LENGTH,maxStorageKeyLength:MAX_STORAGE_KEY_LENGTH,minSortOrder:MIN_SORT_ORDER,maxSortOrder:MAX_SORT_ORDER} as const;
