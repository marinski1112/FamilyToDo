export type CalendarStampPlacement = {
  placement_id: number;
  stamp_date: string;
  visibility_scope: 'FAMILY' | 'PRIVATE';
  private_owner_id: number | null;
  sort_order: number;
  asset_id: number;
  asset_kind: 'ANIMATED' | 'STATIC';
  mime_type: 'image/gif' | 'image/webp' | 'image/png';
  storage_provider: 'ASSETS' | 'UPLOAD';
  storage_key: string;
  thumbnail_storage_key: string | null;
  width: number | null;
  height: number | null;
};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS=62;
const MAX_ROWS=256;

function dayNumber(value:string):number{
  if(!DATE_RE.test(value))throw new Error('invalid calendar stamp date');
  const ms=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(ms))throw new Error('invalid calendar stamp date');
  return Math.floor(ms/86400000);
}

/**
 * Privacy-scoped, bounded read model for Calendar stamp rendering.
 * This deliberately performs no writes/materialization and is not wired into the
 * production Calendar page yet; callers can adopt it after the 1102 profile is stable.
 */
export async function calendarStampPlacementsForRange(
  env:Env,
  familyId:number,
  memberId:number,
  from:string,
  to:string,
):Promise<CalendarStampPlacement[]>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('invalid calendar stamp scope');
  const fromDay=dayNumber(from),toDay=dayNumber(to);
  if(toDay<fromDay||toDay-fromDay+1>MAX_RANGE_DAYS)throw new Error('calendar stamp range exceeds bound');

  const rows=await env.DB.prepare(`SELECT
      p.id placement_id,p.stamp_date,p.visibility_scope,p.private_owner_id,p.sort_order,
      a.id asset_id,a.asset_kind,a.mime_type,a.storage_provider,a.storage_key,a.thumbnail_storage_key,a.width,a.height
    FROM calendar_stamp_placements p
    JOIN calendar_stamp_assets a ON a.id=p.asset_id AND a.family_id=p.family_id
    WHERE p.family_id=?
      AND p.stamp_date BETWEEN ? AND ?
      AND a.active=1
      AND (p.visibility_scope='FAMILY' OR (p.visibility_scope='PRIVATE' AND p.private_owner_id=?))
    ORDER BY p.stamp_date,p.sort_order,p.id
    LIMIT ?`).bind(familyId,from,to,memberId,MAX_ROWS).all<CalendarStampPlacement>();
  return rows.results;
}
