import { D1LocationQueryService } from './location-query-service';
import type { LocationPoint } from './location-providers';

export type LocationDigestDayFacts=Readonly<{
  previous:readonly string[];
  today:readonly string[];
}>;

type MemberRow=Readonly<{id:number;name:string|null}>;

const EMPTY_FACTS:LocationDigestDayFacts=Object.freeze({previous:Object.freeze([]),today:Object.freeze([])});
const MAX_MEMBERS=12;
const HISTORY_LIMIT=500;
const MIN_SEGMENT_METERS=25;

const cleanName=(value:unknown)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,40)||'家族';

const dateShift=(value:string,days:number):string=>{
  const date=new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};

const zonedMidnightUtc=(localDate:string,timeZone:string):string=>{
  const match=localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)throw new Error('invalid local date');
  const target=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),0,0,0,0);
  const formatter=new Intl.DateTimeFormat('en-CA',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  });
  let guess=target;
  for(let i=0;i<4;i+=1){
    const parts=formatter.formatToParts(new Date(guess));
    const part=(type:string)=>Number(parts.find(item=>item.type===type)?.value||0);
    const observed=Date.UTC(part('year'),part('month')-1,part('day'),part('hour'),part('minute'),part('second'));
    const delta=target-observed;
    guess+=delta;
    if(Math.abs(delta)<1000)break;
  }
  return new Date(guess).toISOString();
};

const haversineMeters=(a:LocationPoint,b:LocationPoint):number=>{
  const rad=(degrees:number)=>degrees*Math.PI/180;
  const earth=6371008.8;
  const lat1=rad(a.latitude),lat2=rad(b.latitude);
  const dLat=lat2-lat1,dLon=rad(b.longitude-a.longitude);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return earth*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
};

const accuracyRadiusMeters=(point:LocationPoint):number=>{
  const accuracy=Number(point.accuracyMeters);
  return Number.isFinite(accuracy)&&accuracy>0?accuracy:0;
};

const movementMeters=(points:readonly LocationPoint[]):number=>{
  let total=0;
  for(let i=1;i<points.length;i+=1){
    const previous=points[i-1];
    const current=points[i];
    const centerDistance=haversineMeters(previous,current);
    if(!Number.isFinite(centerDistance))continue;
    // Treat each reported accuracy as a radius around the sample. Only the
    // distance that remains outside both uncertainty envelopes contributes to
    // digest movement, so ordinary GPS jitter is not presented as travel.
    const segment=Math.max(0,centerDistance-accuracyRadiusMeters(previous)-accuracyRadiusMeters(current));
    if(segment>=MIN_SEGMENT_METERS)total+=segment;
  }
  return total;
};

const movementText=(name:string,points:readonly LocationPoint[]):string=>{
  if(points.length===0)return '';
  if(points.length===1)return `📍 ${cleanName(name)} 位置記録あり`;
  const meters=movementMeters(points);
  if(meters<100)return `📍 ${cleanName(name)} 移動記録あり`;
  if(meters<1000)return `📍 ${cleanName(name)} 移動記録 約${Math.max(100,Math.round(meters/100)*100)}m`;
  const kilometers=Math.round((meters/1000)*2)/2;
  return `📍 ${cleanName(name)} 移動記録 約${kilometers.toFixed(kilometers<10?1:0)}km`;
};

const validMembers=(members:readonly MemberRow[]):ReadonlyArray<Readonly<{id:number;name:string}>>=>members
  .map(member=>({id:Number(member.id),name:cleanName(member.name)}))
  .filter(member=>Number.isSafeInteger(member.id)&&member.id>0);

async function summarizeMovementDate(input:Readonly<{
  service:D1LocationQueryService;
  familyId:number;
  requesterMemberId:number;
  members:readonly MemberRow[];
  localDate:string;
  timeZone:string;
}>):Promise<string[]>{
  const {service,familyId,requesterMemberId,localDate,timeZone}=input;
  const members=validMembers(input.members);
  if(!members.length)return [];
  const from=zonedMidnightUtc(localDate,timeZone);
  const next=zonedMidnightUtc(dateShift(localDate,1),timeZone);
  const to=new Date(Date.parse(next)-1).toISOString();
  const histories=await service.historyForSubjects({
    scope:{familyId,requesterMemberId},
    subjectMemberIds:members.map(member=>member.id),
    from,
    to,
    limitPerSubject:HISTORY_LIMIT,
  });
  const lines:string[]=[];
  for(const member of members){
    const line=movementText(member.name,histories.get(member.id)||[]);
    if(line)lines.push(line);
  }
  return lines;
}

/**
 * Build one strict, digest-safe family movement projection for a calendar day.
 * Unlike the optional morning-digest wrapper below, read failures are allowed to
 * propagate so an explicit user inquiry can be retried instead of being reported
 * as an empty day. Raw coordinates never leave this module. Family-wide history
 * is read in one bounded statement so Google Tasks inquiry processing stays
 * within its outer D1 statement budget even at the 12-member cap.
 */
export async function buildLocationMovementDayLines(input:Readonly<{
  db:D1Database;
  familyId:number;
  requesterMemberId:number;
  localDate:string;
  timeZone:string;
}>):Promise<readonly string[]>{
  const {db,familyId,requesterMemberId,localDate,timeZone}=input;
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(requesterMemberId)||requesterMemberId<=0)throw new Error('invalid location movement scope');
  const members=await db.prepare(`SELECT id,name FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL ORDER BY id LIMIT ?`)
    .bind(familyId,MAX_MEMBERS).all<MemberRow>();
  return summarizeMovementDate({
    service:new D1LocationQueryService(db),
    familyId,
    requesterMemberId,
    members:members.results,
    localDate,
    timeZone,
  });
}

/**
 * Build a digest-safe family movement projection from the provider-neutral
 * LocationQueryService. Raw coordinates, device identifiers, addresses and
 * provider payloads never leave this module. Disabled/revoked/non-sharing
 * devices are already filtered by D1LocationQueryService.
 */
export async function buildLocationDigestDayFacts(input:Readonly<{
  db:D1Database;
  familyId:number;
  requesterMemberId:number;
  previousDate:string;
  localDate:string;
  timeZone:string;
}>):Promise<LocationDigestDayFacts>{
  const {db,familyId,requesterMemberId,previousDate,localDate,timeZone}=input;
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(requesterMemberId)||requesterMemberId<=0)return EMPTY_FACTS;
  try{
    const members=await db.prepare(`SELECT id,name FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL ORDER BY id LIMIT ?`)
      .bind(familyId,MAX_MEMBERS).all<MemberRow>();
    const service=new D1LocationQueryService(db);
    const [previous,today]=await Promise.all([
      summarizeMovementDate({service,familyId,requesterMemberId,members:members.results,localDate:previousDate,timeZone}),
      summarizeMovementDate({service,familyId,requesterMemberId,members:members.results,localDate,timeZone}),
    ]);
    return {previous,today};
  }catch{
    // Location is optional enrichment. A schema/provider/read failure must not
    // suppress the authoritative task/Family Log morning digest.
    return EMPTY_FACTS;
  }
}