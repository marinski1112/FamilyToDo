import {readKnownLocationPlaces} from './location-places-api';
import {buildLocationStayReport,locationDistance} from './location-stay-report';
import type {LocationPoint} from './location-providers';

const RAW_RETENTION_SECONDS=24*60*60;
const MAX_ARCHIVE_GROUPS_PER_RUN=8;
const MAX_RAW_POINTS_PER_DAY=2000;
const MAX_ROUTE_POINTS=72;
const ROUTE_DISTANCE_STEP_METERS=200;
const ROUTE_TIME_STEP_MS=10*60*1000;
const RAW_DELETE_BATCH=2000;

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

async function archiveOneDay(db:D1Database,group:ArchiveGroup):Promise<boolean>{
  const raw=await db.prepare(`
    SELECT latitude,longitude,accuracy_meters,recorded_at
    FROM member_location_history
    WHERE family_id=? AND member_id=? AND date(recorded_at,'+9 hours')=?
    ORDER BY recorded_at ASC,id ASC
    LIMIT ?
  `).bind(group.family_id,group.member_id,group.local_date,MAX_RAW_POINTS_PER_DAY+1).all<RawRow>();
  if(raw.results.length===0)return false;
  // Fail closed instead of archiving a silently truncated day. A later run keeps
  // the raw rows intact so the cap can be investigated without data loss.
  if(raw.results.length>MAX_RAW_POINTS_PER_DAY)return false;
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
    points[0].recordedAt,points[points.length-1].recordedAt,points.length,
    route.length,routeJson(route),
  ));
  await db.batch(statements);
  const marker=await db.prepare(`SELECT 1 AS ok FROM location_history_archive_days WHERE family_id=? AND member_id=? AND local_date=? LIMIT 1`)
    .bind(group.family_id,group.member_id,group.local_date).first<{ok:number}>();
  return marker?.ok===1;
}

async function archivePendingDays(db:D1Database):Promise<void>{
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
  for(const group of groups.results){
    try{await archiveOneDay(db,group);}catch{/* Never delete a day whose archive failed. */}
  }
}

async function deleteArchivedRaw(db:D1Database):Promise<void>{
  await db.prepare(`
    DELETE FROM member_location_history
    WHERE id IN (
      SELECT h.id
      FROM member_location_history h
      JOIN location_history_archive_days a
        ON a.family_id=h.family_id
       AND a.member_id=h.member_id
       AND a.local_date=date(h.recorded_at,'+9 hours')
      WHERE unixepoch(h.recorded_at)<unixepoch('now')-?
      ORDER BY h.recorded_at ASC,h.id ASC
      LIMIT ?
    )
  `).bind(RAW_RETENTION_SECONDS,RAW_DELETE_BATCH).run();
}

/**
 * Long-term Location lifecycle: summarize complete JST days first, then remove
 * only raw points whose day has a durable archive marker. The 24-hour raw
 * window is a retention target; archival failure deliberately extends it rather
 * than deleting unarchived location data.
 */
export async function archiveAndCleanupLocationHistory(env:Env):Promise<void>{
  await archivePendingDays(env.DB);
  await deleteArchivedRaw(env.DB);
}
