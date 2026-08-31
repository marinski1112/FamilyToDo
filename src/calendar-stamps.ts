export type CalendarStampPlacement = {
  placement_id: number;
  stamp_date: string;
  visibility_scope: 'FAMILY' | 'PRIVATE';
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
const MAX_STORAGE_KEY_LENGTH=512;
const MAX_DIMENSION=4096;
const MIN_SORT_ORDER=-1000;
const MAX_SORT_ORDER=1000;

function dayNumber(value:string):number{
  if(!DATE_RE.test(value))throw new Error('invalid calendar stamp date');
  const ms=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(ms))throw new Error('invalid calendar stamp date');
  if(new Date(ms).toISOString().slice(0,10)!==value)throw new Error('invalid calendar stamp date');
  return Math.floor(ms/86400000);
}

function safeStorageKey(value:unknown):boolean{
  if(typeof value!=='string')return false;
  const key=value.trim();
  if(!key||key!==value||key.length>MAX_STORAGE_KEY_LENGTH)return false;
  const lower=key.toLowerCase();
  if(lower.startsWith('data:')||key.includes('://')||/[\u0000-\u001f\u007f]/.test(key))return false;
  const slashNormalized=key.replaceAll('\\','/');
  if(slashNormalized.startsWith('//'))return false;
  return !slashNormalized.split('/').some(segment=>segment==='..');
}

function safeDimension(value:unknown):boolean{
  return value===null||(typeof value==='number'&&Number.isSafeInteger(value)&&value>=1&&value<=MAX_DIMENSION);
}

function safeCalendarStampPlacement(row:CalendarStampPlacement,fromDay:number,toDay:number):boolean{
  if(!Number.isSafeInteger(row.placement_id)||row.placement_id<=0||!Number.isSafeInteger(row.asset_id)||row.asset_id<=0)return false;
  if(!Number.isSafeInteger(row.sort_order)||row.sort_order<MIN_SORT_ORDER||row.sort_order>MAX_SORT_ORDER)return false;
  if(row.visibility_scope!=='FAMILY'&&row.visibility_scope!=='PRIVATE')return false;
  if(row.asset_kind!=='ANIMATED'&&row.asset_kind!=='STATIC')return false;
  if(!['image/gif','image/webp','image/png'].includes(row.mime_type))return false;
  if(row.asset_kind==='ANIMATED'&&row.mime_type==='image/png')return false;
  if(row.storage_provider!=='ASSETS'&&row.storage_provider!=='UPLOAD')return false;
  if(!safeStorageKey(row.storage_key))return false;
  if(row.thumbnail_storage_key!==null&&!safeStorageKey(row.thumbnail_storage_key))return false;
  if(!safeDimension(row.width)||!safeDimension(row.height)||(row.width===null)!==(row.height===null))return false;
  try{
    const stampDay=dayNumber(row.stamp_date);
    return stampDay>=fromDay&&stampDay<=toDay;
  }catch{
    return false;
  }
}

async function assertActiveMember(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1')
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp member unavailable');
}

/**
 * Privacy-scoped, bounded read model for Calendar stamp rendering.
 * This deliberately performs no writes/materialization and is not wired into the
 * production Calendar page yet; callers can adopt it after the 1102 profile is stable.
 * Legacy or externally-mutated rows with unsafe renderer metadata fail closed here
 * instead of being exposed to a future DOM/asset resolver.
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
  await assertActiveMember(env,familyId,memberId);

  const rows=await env.DB.prepare(`SELECT
      p.id placement_id,p.stamp_date,p.visibility_scope,p.sort_order,
      a.id asset_id,a.asset_kind,a.mime_type,a.storage_provider,a.storage_key,a.thumbnail_storage_key,a.width,a.height
    FROM calendar_stamp_placements p
    JOIN calendar_stamp_assets a ON a.id=p.asset_id AND a.family_id=p.family_id
    WHERE p.family_id=?
      AND p.stamp_date BETWEEN ? AND ?
      AND a.active=1
      AND (p.visibility_scope='FAMILY' OR (p.visibility_scope='PRIVATE' AND p.private_owner_id=?))
    ORDER BY p.stamp_date,p.sort_order,p.id
    LIMIT ?`).bind(familyId,from,to,memberId,MAX_ROWS).all<CalendarStampPlacement>();
  return rows.results.filter(row=>safeCalendarStampPlacement(row,fromDay,toDay));
}
