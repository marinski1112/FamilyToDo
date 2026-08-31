import type { CalendarStampAssetOption } from './calendar-stamp-actions';
import { CALENDAR_STAMP_ACTION_LIMITS } from './calendar-stamp-actions';

export type CalendarStampAdminAssetOption = CalendarStampAssetOption & {
  active: 0 | 1;
};

function assertPositiveId(value:number,label:string):void{
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`invalid ${label}`);
}

async function assertActiveAdmin(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp admin required');
}

/**
 * Bounded admin inventory for future settings UI. Unlike the ordinary picker,
 * this intentionally includes soft-disabled assets so they can be re-enabled.
 * Creator/member identity and placement/private data are never selected.
 */
export async function calendarStampAssetsForAdmin(
  env:Env,
  familyId:number,
  memberId:number,
  limit=CALENDAR_STAMP_ACTION_LIMITS.maxAssetOptions,
):Promise<CalendarStampAdminAssetOption[]>{
  assertPositiveId(familyId,'calendar stamp family');
  assertPositiveId(memberId,'calendar stamp member');
  await assertActiveAdmin(env,familyId,memberId);

  const max=CALENDAR_STAMP_ACTION_LIMITS.maxAssetOptions;
  const boundedLimit=Math.max(1,Math.min(max,Math.trunc(Number(limit)||max)));
  const rows=await env.DB.prepare(`SELECT id,name,asset_kind,mime_type,storage_provider,storage_key,thumbnail_storage_key,width,height,active
    FROM calendar_stamp_assets
    WHERE family_id=?
    ORDER BY active DESC,id
    LIMIT ?`).bind(familyId,boundedLimit).all<CalendarStampAdminAssetOption>();
  return rows.results;
}
