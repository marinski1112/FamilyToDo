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

export type CalendarStampPlacementInput = {
  assetId: number;
  stampDate: string;
  visibilityScope?: 'FAMILY' | 'PRIVATE';
  sortOrder?: number;
};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_ASSET_OPTIONS=64;
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

async function assertActiveMember(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp member unavailable');
}

export async function calendarStampAssetsForPicker(env:Env,familyId:number,limit=MAX_ASSET_OPTIONS):Promise<CalendarStampAssetOption[]>{
  assertPositiveId(familyId,'calendar stamp family');
  const boundedLimit=Math.max(1,Math.min(MAX_ASSET_OPTIONS,Math.trunc(Number(limit)||MAX_ASSET_OPTIONS)));
  const rows=await env.DB.prepare(`SELECT id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height
    FROM calendar_stamp_assets
    WHERE family_id=? AND active=1
    ORDER BY id
    LIMIT ?`).bind(familyId,boundedLimit).all<CalendarStampAssetOption>();
  return rows.results;
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
  const asset=await env.DB.prepare('SELECT id FROM calendar_stamp_assets WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(input.assetId,familyId).first<{id:number}>();
  if(!asset)throw new Error('calendar stamp asset unavailable');

  const now=utcNow();
  const result=await env.DB.prepare(`INSERT INTO calendar_stamp_placements(
      family_id,asset_id,stamp_date,visibility_scope,private_owner_id,sort_order,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(familyId,input.assetId,input.stampDate,visibility,visibility==='PRIVATE'?memberId:null,sortOrder,memberId,now,now).run();
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

export const CALENDAR_STAMP_ACTION_LIMITS={maxAssetOptions:MAX_ASSET_OPTIONS,minSortOrder:MIN_SORT_ORDER,maxSortOrder:MAX_SORT_ORDER} as const;
