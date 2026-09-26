import {readKnownLocationPlaces} from './location-places-api';
import {buildLocationStayReport,locationDistance} from './location-stay-report';
import type {LocationPoint} from './location-providers';

const MAX_ARCHIVE_GROUPS_PER_RUN=8;
const MAX_ARCHIVE_SCAN_ROWS_PER_RUN=2048;
const MAX_ARCHIVE_GROUPS_CHECKED_PER_RUN=32;
const MAX_ARCHIVE_GROUPS_PER_STREAM=4;
const MAX_MINUTE_POINTS_PER_DAY=1440;
const MAX_ROUTE_POINTS=72;
const ROUTE_DISTANCE_STEP_METERS=200;
const ROUTE_TIME_STEP_MS=10*60*1000;

type ArchiveGroup={family_id:number;member_id:number;local_date:string};
type RawRow={latitude:number;longitude:number;accuracy_meters:number|null;recorded_at:string};

const todayJst=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date());
const jstDayBounds=(day:string)=>{
  const start=new Date(`${day}T00:00:00+09:00`);
  return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()] as const;
};
const localDate=(recordedAt:string)=>{
  const instant=new Date(recordedAt);
  return Number.isFinite(instant.getTime())?new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  }).format(instant):'';
};

function toPoint(row:RawRow):LocationPoint|null{
  const latitude=Number(row.latitude),longitude=Number(row.longitude),accuracy=Number(row.accuracy_meters);
  if(!Number.isFinite(latitude)||latitude< -90||latitude>90||!Number.isFinite(longitude)||longitude< -180||longitude>180)return null;
  if(!Number.isFinite(Date.parse(String(row.recorded_at))))return null;
  return {latitude,longitude,recordedAt:String(row.recorded_at),...(row.accuracy_meters==null||!Number.isFinite(accuracy)?{}:{accuracyMeters:accuracy})};
}

function simplifyRoute(points:readonly LocationPoint[]):LocationPoint[]{
  if(points.length<=2)return [...points];
  const quality=points.filter(point=>Number.isFinite(point.accuracyMeters)&&Number(point.accuracyMeters)<=150);
  const source=quality.length>=2?quality:[...points];
  if(source.length<=MAX_ROUTE_POINTS)return source;
  const kept:LocationPoint[]=[source[0]];
  for(let i=1;i<source.length-1;i+=1){
    const point=source[i],last=kept[kept.length-1];
    const elapsed=Date.parse(point.recordedAt)-Date.parse(last.recordedAt);
    if(locationDistance(last,point)>=ROUTE_DISTANCE_STEP_METERS||elapsed>=ROUTE_TIME_STEP_MS)kept.push(point);
  }
  if(kept.at(-1)?.recordedAt!==source.at(-1)?.recordedAt)kept.push(source[source.length-1]);
  if(kept.length<=MAX_ROUTE_POINTS)return kept;
  const bounded:LocationPoint[]=[];
  for(let i=0;i<MAX_ROUTE_POINTS;i+=1){
    const index=Math.round(i*(kept.length-1)/(MAX_ROUTE_POINTS-1));
    const point=kept[index];
    if(!bounded.length||bounded.at(-1)?.recordedAt!==point.recordedAt)bounded.push(point);
  }
  return bounded;
}

function routeJson(points:readonly LocationPoint[]):string{
  return JSON.stringify(points.map(point=>[
    point.recordedAt,
    Number(point.latitude.toFixed(6)),
    Number(point.longitude.toFixed(6)),
    point.accuracyMeters===undefined?null:Math.round(point.accuracyMeters),
  ]));
}

async function archiveOneDay(db:D1Database,group:ArchiveGroup):Promise<boolean>{
  const [start,end]=jstDayBounds(group.local_date);
  const count=await db.prepare(`
    SELECT COUNT(*) AS raw_point_count
    FROM member_location_history
    WHERE family_id=? AND member_id=? AND recorded_at>=? AND recorded_at<?
  `).bind(group.family_id,group.member_id,start,end).first<{raw_point_count:number}>();
  const rawPointCount=Math.max(0,Number(count?.raw_point_count)||0);
  if(rawPointCount===0)return false;
  // Dense Overland ingress can exceed 10k raw fixes/day. Archive from one
  // representative fix per local minute so a full day stays bounded without
  // excluding high-volume days from durable stay/search projections.
  const raw=await db.prepare(`
    SELECT latitude,longitude,accuracy_meters,recorded_at
    FROM (
      SELECT h.id,h.latitude,h.longitude,h.accuracy_meters,h.recorded_at,
        ROW_NUMBER() OVER (
          PARTITION BY substr(h.recorded_at,1,16)
          ORDER BY CASE WHEN h.accuracy_meters IS NULL THEN 1 ELSE 0 END,
                   h.accuracy_meters ASC,h.recorded_at DESC,h.id DESC
        ) AS minute_rank
      FROM member_location_history h
      WHERE h.family_id=? AND h.member_id=? AND h.recorded_at>=? AND h.recorded_at<?
    ) sampled
    WHERE minute_rank=1
    ORDER BY recorded_at ASC,id ASC
    LIMIT ?
  `).bind(group.family_id,group.member_id,start,end,MAX_MINUTE_POINTS_PER_DAY).all<RawRow>();
  const points=raw.results.map(toPoint).filter((point):point is LocationPoint=>Boolean(point));
  if(points.length===0)return false;

  const places=await readKnownLocationPlaces(db,group.family_id);
  const stays=buildLocationStayReport(points,places).filter(entry=>entry.kind==='STAY').slice(0,100);
  const anchors=new Map(points.map(point=>[point.recordedAt,point]));
  const route=simplifyRoute(points);
  const statements=[] as D1PreparedStatement[];
  for(const stay of stays){
    const anchor=anchors.get(stay.from);
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO location_history_stays(
        family_id,member_id,local_date,started_at,ended_at,duration_minutes,
        place_label,address_label,anchor_latitude,anchor_longitude
      ) VALUES(?,?,?,?,?,?,?,NULL,?,?)
    `).bind(
      group.family_id,group.member_id,group.local_date,stay.from,stay.to,stay.minutes,
      stay.place,anchor?.latitude??null,anchor?.longitude??null,
    ));
  }
  statements.push(db.prepare(`
    INSERT INTO location_history_archive_days(
      family_id,member_id,local_date,started_at,ended_at,raw_point_count,
      route_point_count,route_json,archived_at
    ) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(family_id,member_id,local_date) DO NOTHING
  `).bind(
    group.family_id,group.member_id,group.local_date,
    points[0].recordedAt,points[points.length-1].recordedAt,rawPointCount,
    route.length,routeJson(route),
  ));
  await db.batch(statements);
  const marker=await db.prepare(`SELECT 1 AS ok FROM location_history_archive_days WHERE family_id=? AND member_id=? AND local_date=? LIMIT 1`)
    .bind(group.family_id,group.member_id,group.local_date).first<{ok:number}>();
  return marker?.ok===1;
}

async function archivePendingDays(db:D1Database):Promise<ArchiveGroup[]>{
  const marker=await db.prepare('SELECT last_id FROM location_history_archive_scan_state WHERE id=1').first<{last_id:number}>();
  const lastId=Math.max(0,Number(marker?.last_id)||0);
  // Scan by the integer primary key. Even a permanently broken or already
  // archived day cannot hold the cursor in place. An empty page wraps it, so
  // failed groups and late arrivals are retried on later cycles.
  const page=await db.prepare('SELECT id,family_id,member_id,recorded_at FROM member_location_history WHERE id>? ORDER BY id LIMIT ?')
    .bind(lastId,MAX_ARCHIVE_SCAN_ROWS_PER_RUN).all<ArchiveGroup&{id:number;recorded_at:string}>();
  const today=todayJst();
  const recentDate=new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'});
  const [recentStart,recentEnd]=jstDayBounds(recentDate);
  // Prioritize yesterday without walking the entire historical table. This
  // range is backed by the global recorded_at index added in migration 0107.
  const recent=await db.prepare('SELECT family_id,member_id,recorded_at FROM member_location_history WHERE recorded_at>=? AND recorded_at<? ORDER BY recorded_at LIMIT ?')
    .bind(recentStart,recentEnd,MAX_ARCHIVE_SCAN_ROWS_PER_RUN).all<ArchiveGroup&{recorded_at:string}>();
  const groupsFor=(rows:ReadonlyArray<ArchiveGroup&{recorded_at:string}>)=>{
    const groups=new Map<string,ArchiveGroup>();
    for(const row of rows){
      const date=localDate(String(row.recorded_at||''));
      if(!date||date>=today)continue;
      const familyId=Number(row.family_id),memberId=Number(row.member_id);
      if(!Number.isSafeInteger(familyId)||!Number.isSafeInteger(memberId))continue;
      const key=`${familyId}:${memberId}:${date}`;
      if(!groups.has(key))groups.set(key,{family_id:familyId,member_id:memberId,local_date:date});
    }
    return groups;
  };
  const archived:ArchiveGroup[]=[];
  const seen=new Set<string>();
  const inspect=async(groups:Map<string,ArchiveGroup>)=>{
    let checked=0,created=0,lastCheckedKey='';
    for(const [key,group] of groups){
      if(checked>=MAX_ARCHIVE_GROUPS_CHECKED_PER_RUN/2||created>=MAX_ARCHIVE_GROUPS_PER_STREAM)break;
      if(seen.has(key))continue;
      seen.add(key);checked++;lastCheckedKey=key;
      try{
        const existing=await db.prepare('SELECT 1 ok FROM location_history_archive_days WHERE family_id=? AND member_id=? AND local_date=? LIMIT 1')
          .bind(group.family_id,group.member_id,group.local_date).first<{ok:number}>();
        if(!existing&&await archiveOneDay(db,group)){archived.push(group);created++;}
      }catch{/* Archive failure must never mutate raw history. */}
    }
    return {lastCheckedKey,limited:checked>=MAX_ARCHIVE_GROUPS_CHECKED_PER_RUN/2||created>=MAX_ARCHIVE_GROUPS_PER_STREAM};
  };
  await inspect(groupsFor(recent.results));
  const background=await inspect(groupsFor(page.results));
  let nextId=page.results.length?Number(page.results[page.results.length-1].id):0;
  if(background.limited&&background.lastCheckedKey){
    // A page can contain more distinct family-days than the per-run budget.
    // Resume at the last inspected group's first row instead of skipping all
    // remaining groups until the next full cycle.
    const last=page.results.find(row=>`${Number(row.family_id)}:${Number(row.member_id)}:${localDate(String(row.recorded_at||''))}`===background.lastCheckedKey);
    if(last)nextId=Number(last.id);
  }
  // Persist after processing. A failed cursor write replays the same page;
  // archive writes are idempotent and the next run can recover.
  await db.prepare('UPDATE location_history_archive_scan_state SET last_id=? WHERE id=1')
    .bind(nextId).run();
  return archived;
}

/**
 * Build durable, bounded daily Location projections. Raw member_location_history
 * is intentionally NOT deleted here. Raw cleanup belongs to a separate explicit
 * data-maintenance/archive workflow after durable family-day summaries exist.
 */
export async function archiveLocationHistory(env:Env):Promise<ArchiveGroup[]>{
  return archivePendingDays(env.DB);
}

// Compatibility for any branch/runtime caller created before the retention policy
// changed. Despite the historical name this now archives only and never deletes raw.
export const archiveAndCleanupLocationHistory=archiveLocationHistory;
