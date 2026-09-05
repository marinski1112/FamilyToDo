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

const movementMeters=(points:readonly LocationPoint[]):number=>{
  let total=0;
  for(let i=1;i<points.length;i+=1){
    const segment=haversineMeters(points[i-1],points[i]);
    if(Number.isFinite(segment)&&segment>=MIN_SEGMENT_METERS)total+=segment;
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
    const summarizeDate=async(date:string):Promise<string[]>=>{
      const from=zonedMidnightUtc(date,timeZone);
      const next=zonedMidnightUtc(dateShift(date,1),timeZone);
      const to=new Date(Date.parse(next)-1).toISOString();
      const lines:string[]=[];
      for(const member of members.results){
        const subjectMemberId=Number(member.id);
        if(!Number.isSafeInteger(subjectMemberId)||subjectMemberId<=0)continue;
        const points=await service.history({
          scope:{familyId,requesterMemberId},subjectMemberId,from,to,limit:HISTORY_LIMIT,
        });
        const line=movementText(cleanName(member.name),points);
        if(line)lines.push(line);
      }
      return lines;
    };
    const [previous,today]=await Promise.all([summarizeDate(previousDate),summarizeDate(localDate)]);
    return {previous,today};
  }catch{
    // Location is optional enrichment. A schema/provider/read failure must not
    // suppress the authoritative task/Family Log morning digest.
    return EMPTY_FACTS;
  }
}
