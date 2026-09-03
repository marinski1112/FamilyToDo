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

export type CalendarStampFrame = {
  asset_id: number;
  frame_index: number;
  storage_key: string;
  duration_ms: number;
};

export type CalendarStampFrameReadResult = {
  frames: CalendarStampFrame[];
  invalidAssetIds: number[];
};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS=62;
const MAX_ROWS=256;
const MAX_STORAGE_KEY_LENGTH=512;
const MAX_DIMENSION=4096;
const MIN_SORT_ORDER=-1000;
const MAX_SORT_ORDER=1000;
const MAX_FRAMES_PER_ASSET=48;
const FRAME_QUERY_CHUNK=64;
const SCHEME_RE=/^[A-Za-z][A-Za-z0-9+.-]*:/;

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
  if(lower.startsWith('data:')||SCHEME_RE.test(key)||key.includes('://')||/[\u0000-\u001f\u007f]/.test(key))return false;
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

function safeCalendarStampFrame(row:CalendarStampFrame):boolean{
  return Number.isSafeInteger(row.asset_id)&&row.asset_id>0
    &&Number.isSafeInteger(row.frame_index)&&row.frame_index>=0&&row.frame_index<MAX_FRAMES_PER_ASSET
    &&safeStorageKey(row.storage_key)
    &&Number.isSafeInteger(row.duration_ms)&&row.duration_ms>=40&&row.duration_ms<=2000;
}

async function assertActiveMember(env:Env,familyId:number,memberId:number):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1')
    .bind(memberId,familyId).first<{id:number}>();
  if(!row)throw new Error('calendar stamp member unavailable');
}

/** Privacy-scoped, bounded read model for Calendar stamp rendering. */
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

  const placements:CalendarStampPlacement[]=[];
  let cursorDate:string|null=null;
  let cursorSort=0;
  let cursorId=0;
  while(placements.length<MAX_ROWS){
    const cursorClause=cursorDate===null?'':`\n      AND (p.stamp_date>? OR (p.stamp_date=? AND p.sort_order>?) OR (p.stamp_date=? AND p.sort_order=? AND p.id>?))`;
    const statement=env.DB.prepare(`SELECT
        p.id placement_id,p.stamp_date,p.visibility_scope,p.sort_order,
        a.id asset_id,a.asset_kind,a.mime_type,a.storage_provider,a.storage_key,a.thumbnail_storage_key,a.width,a.height
      FROM calendar_stamp_placements p
      JOIN calendar_stamp_assets a ON a.id=p.asset_id AND a.family_id=p.family_id
      WHERE p.family_id=?
        AND p.stamp_date BETWEEN ? AND ?
        AND a.active=1
        AND (p.visibility_scope='FAMILY' OR (p.visibility_scope='PRIVATE' AND p.private_owner_id=?))${cursorClause}
      ORDER BY p.stamp_date,p.sort_order,p.id
      LIMIT ?`);
    const bound:D1PreparedStatement=cursorDate===null
      ?statement.bind(familyId,from,to,memberId,MAX_ROWS)
      :statement.bind(familyId,from,to,memberId,cursorDate,cursorDate,cursorSort,cursorDate,cursorSort,cursorId,MAX_ROWS);
    const rows:{results:CalendarStampPlacement[];meta:any}=await bound.all<CalendarStampPlacement>();
    if(rows.results.length===0)break;
    for(const row of rows.results){
      if(safeCalendarStampPlacement(row,fromDay,toDay))placements.push(row);
      if(placements.length===MAX_ROWS)break;
    }
    if(placements.length===MAX_ROWS||rows.results.length<MAX_ROWS)break;
    const last:CalendarStampPlacement=rows.results[rows.results.length-1]!;
    cursorDate=last.stamp_date;
    cursorSort=last.sort_order;
    cursorId=last.placement_id;
  }
  return placements;
}

/**
 * Reads ordered PNG-frame metadata for already privacy-authorized assets.
 * Any malformed persisted row marks its whole asset invalid so the browser never
 * receives a silently truncated animation sequence.
 */
export async function calendarStampFramesForAssets(
  env:Env,
  familyId:number,
  memberId:number,
  assetIds:number[],
):Promise<CalendarStampFrameReadResult>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('invalid calendar stamp scope');
  await assertActiveMember(env,familyId,memberId);
  const ids=[...new Set(assetIds.filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,MAX_ROWS);
  if(!ids.length)return {frames:[],invalidAssetIds:[]};
  const frames:CalendarStampFrame[]=[];
  const invalidAssetIds=new Set<number>();
  for(let offset=0;offset<ids.length;offset+=FRAME_QUERY_CHUNK){
    const chunk=ids.slice(offset,offset+FRAME_QUERY_CHUNK);
    const placeholders=chunk.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT f.asset_id,f.frame_index,f.storage_key,f.duration_ms
      FROM calendar_stamp_asset_frames f
      JOIN calendar_stamp_assets a ON a.id=f.asset_id AND a.family_id=f.family_id
      WHERE f.family_id=? AND f.asset_id IN (${placeholders})
        AND a.active=1 AND a.asset_kind='ANIMATED' AND a.mime_type='image/png'
      ORDER BY f.asset_id,f.frame_index
      LIMIT ?`).bind(familyId,...chunk,chunk.length*MAX_FRAMES_PER_ASSET).all<CalendarStampFrame>();
    for(const row of rows.results){
      if(safeCalendarStampFrame(row))frames.push(row);
      else if(Number.isSafeInteger(row.asset_id)&&row.asset_id>0)invalidAssetIds.add(row.asset_id);
    }
  }
  return {frames:frames.filter(frame=>!invalidAssetIds.has(frame.asset_id)),invalidAssetIds:[...invalidAssetIds]};
}
