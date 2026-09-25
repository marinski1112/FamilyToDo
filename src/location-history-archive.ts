import {readKnownLocationPlaces} from './location-places-api';
import {buildLocationStayReport,locationDistance} from './location-stay-report';
import type {LocationPoint} from './location-providers';

const MAX_ARCHIVE_GROUPS_PER_RUN=8;
const ARCHIVE_REBUILD_FROM_LOCAL_DATE='2026-09-14';
const ARCHIVE_REBUILD_BEFORE='2026-09-25T14:00:00Z';
const MAX_MINUTE_POINTS_PER_DAY=1440;
const MAX_ROUTE_POINTS=72;
const ROUTE_DISTANCE_STEP_METERS=200;
const ROUTE_TIME_STEP_MS=10*60*1000;

type ArchiveGroup={family_id:number;member_id:number;local_date:string};
type RawRow={latitude:number;longitude:number;accuracy_meters:number|null;recorded_at:string};

const todayJst=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date());

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

async function archiveOneDay(db:D1Database,group:ArchiveGroup,{replaceExisting=false}:{replaceExisting?:boolean}={}):Promise<boolean>{
  const count=await db.prepare(`
    SELECT COUNT(*) AS raw_point_count
    FROM member_location_history
    WHERE family_id=? AND member_id=? AND date(recorded_at,'+9 hours')=?
  `).bind(group.family_id,group.member_id,group.local_date).first<{raw_point_count:number}>();
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
      WHERE h.family_id=? AND h.member_id=? AND date(h.recorded_at,'+9 hours')=?
    ) sampled
    WHERE minute_rank=1
    ORDER BY recorded_at ASC,id ASC
    LIMIT ?
  `).bind(group.family_id,group.member_id,group.local_date,MAX_MINUTE_POINTS_PER_DAY).all<RawRow>();
  const points=raw.results.map(toPoint).filter((point):point is LocationPoint=>Boolean(point));
  if(points.length===0)return false;

  const places=await readKnownLocationPlaces(db,group.family_id);
  const stays=buildLocationStayReport(points,places).filter(entry=>entry.kind==='STAY').slice(0,100);
  const anchors=new Map(points.map(point=>[point.recordedAt,point]));
  const route=simplifyRoute(points);
  const statements=[] as D1PreparedStatement[];
  if(replaceExisting){
    // Rebuild only the derived projection. Raw GPS remains untouched.
    statements.push(db.prepare(`
      DELETE FROM location_history_stays
      WHERE family_id=? AND member_id=? AND local_date=?
    `).bind(group.family_id,group.member_id,group.local_date));
    statements.push(db.prepare(`
      DELETE FROM location_history_archive_days
      WHERE family_id=? AND member_id=? AND local_date=?
    `).bind(group.family_id,group.member_id,group.local_date));
  }
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

async function rebuildIncompleteArchivedDays(db:D1Database):Promise<ArchiveGroup[]>{
  // 9/14 onward was already marked archived by the previous projection logic.
  // Rebuild those derived rows once from retained raw GPS when no STAY rows exist.
  const groups=await db.prepare(`
    SELECT a.family_id,a.member_id,a.local_date
    FROM location_history_archive_days a
    WHERE a.local_date>=? AND a.local_date<?
      AND a.archived_at<?
      AND a.raw_point_count>0
      AND NOT EXISTS(
        SELECT 1 FROM location_history_stays s
        WHERE s.family_id=a.family_id AND s.member_id=a.member_id AND s.local_date=a.local_date
      )
      AND EXISTS(
        SELECT 1 FROM member_location_history h
        WHERE h.family_id=a.family_id AND h.member_id=a.member_id
          AND date(h.recorded_at,'+9 hours')=a.local_date
      )
    ORDER BY a.local_date DESC
    LIMIT ?
  `).bind(ARCHIVE_REBUILD_FROM_LOCAL_DATE,todayJst(),ARCHIVE_REBUILD_BEFORE,MAX_ARCHIVE_GROUPS_PER_RUN).all<ArchiveGroup>();
  const rebuilt:ArchiveGroup[]=[];
  for(const group of groups.results){
    try{if(await archiveOneDay(db,group,{replaceExisting:true}))rebuilt.push(group);}
    catch{/* Rebuild failure must never mutate raw history. */}
  }
  return rebuilt;
}

async function archivePendingDays(db:D1Database):Promise<ArchiveGroup[]>{
  const groups=await db.prepare(`
    SELECT h.family_id,h.member_id,date(h.recorded_at,'+9 hours') AS local_date
    FROM member_location_history h
    WHERE date(h.recorded_at,'+9 hours')<?
      AND NOT EXISTS(
        SELECT 1 FROM location_history_archive_days a
        WHERE a.family_id=h.family_id AND a.member_id=h.member_id
          AND a.local_date=date(h.recorded_at,'+9 hours')
      )
    GROUP BY h.family_id,h.member_id,local_date
    ORDER BY local_date DESC
    LIMIT ?
  `).bind(todayJst(),MAX_ARCHIVE_GROUPS_PER_RUN).all<ArchiveGroup>();
  const archived:ArchiveGroup[]=[];
  for(const group of groups.results){
    try{if(await archiveOneDay(db,group))archived.push(group);}catch{/* Archive failure must never mutate raw history. */}
  }
  return archived;
}

/**
 * Build durable, bounded daily Location projections. Raw member_location_history
 * is intentionally NOT deleted here. Raw cleanup belongs to a separate explicit
 * data-maintenance/archive workflow after durable family-day summaries exist.
 */
export async function archiveLocationHistory(env:Env):Promise<ArchiveGroup[]>{
  const rebuilt=await rebuildIncompleteArchivedDays(env.DB);
  const archived=await archivePendingDays(env.DB);
  return [...rebuilt,...archived];
}

// Compatibility for any branch/runtime caller created before the retention policy
// changed. Despite the historical name this now archives only and never deletes raw.
export const archiveAndCleanupLocationHistory=archiveLocationHistory;
