import type { AppContext } from './app-context';
import { D1LocationQueryService } from './location-query-service';
import {readKnownLocationPlaces} from './location-places-api';
import {buildLocationStayReport} from './location-stay-report';
import {constantTimeEqual} from './security';
import { json } from './response';
import type {LocationPoint} from './location-providers';

const HISTORY_LIMIT=500;
const MAX_HISTORY_WINDOW_MS=31*24*60*60*1000;
const SEARCH_LIMIT=50;

const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const canonicalIso=(value:string):boolean=>{
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value;
};
const validDate=(value:string):boolean=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00+09:00'));
const todayJst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayRange=(date:string)=>{
  const start=Date.parse(date+'T00:00:00+09:00');
  return {from:new Date(start).toISOString(),to:new Date(start+24*60*60*1000-1).toISOString()};
};

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}

type ArchiveDayRow={route_json:string;raw_point_count:number;route_point_count:number;started_at:string;ended_at:string};
type ArchiveStayRow={id:number;started_at:string;ended_at:string;duration_minutes:number;place_label:string;address_label:string|null;anchor_latitude:number|null;anchor_longitude:number|null};

function parseArchivedRoute(text:string):LocationPoint[]{
  let value:unknown;
  try{value=JSON.parse(text);}catch{return [];}
  if(!Array.isArray(value))return [];
  const points:LocationPoint[]=[];
  for(const row of value){
    if(!Array.isArray(row)||row.length<3)continue;
    const recordedAt=String(row[0]||''),latitude=Number(row[1]),longitude=Number(row[2]),accuracy=row[3]==null?undefined:Number(row[3]);
    if(!canonicalIso(recordedAt)||!Number.isFinite(latitude)||latitude< -90||latitude>90||!Number.isFinite(longitude)||longitude< -180||longitude>180)continue;
    if(accuracy!==undefined&&(!Number.isFinite(accuracy)||accuracy<0))continue;
    points.push({latitude,longitude,recordedAt,...(accuracy===undefined?{}:{accuracyMeters:accuracy})});
  }
  return points;
}

async function readArchivedDay(ctx:AppContext,familyId:number,requesterMemberId:number,subjectMemberId:number,date:string):Promise<ArchiveDayRow|null>{
  return await ctx.env.DB.prepare(`
    SELECT a.route_json,a.raw_point_count,a.route_point_count,a.started_at,a.ended_at
    FROM location_history_archive_days a
    JOIN members subject ON subject.id=a.member_id AND subject.family_id=a.family_id AND subject.active=1
    WHERE a.family_id=? AND a.member_id=? AND a.local_date=?
      AND EXISTS(SELECT 1 FROM members requester WHERE requester.id=? AND requester.family_id=? AND requester.active=1)
      AND EXISTS(SELECT 1 FROM location_devices d WHERE d.family_id=a.family_id AND d.member_id=a.member_id AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL)
    LIMIT 1
  `).bind(familyId,subjectMemberId,date,requesterMemberId,familyId).first<ArchiveDayRow>();
}

async function archivedResponse(ctx:AppContext,familyId:number,subjectMemberId:number,date:string,day:ArchiveDayRow):Promise<Response>{
  const stays=await ctx.env.DB.prepare(`
    SELECT id,started_at,ended_at,duration_minutes,place_label,address_label,anchor_latitude,anchor_longitude
    FROM location_history_stays
    WHERE family_id=? AND member_id=? AND local_date=?
    ORDER BY started_at ASC,id ASC
    LIMIT 100
  `).bind(familyId,subjectMemberId,date).all<ArchiveStayRow>();
  const points=parseArchivedRoute(String(day.route_json||'[]'));
  return json({
    ok:true,archived:true,memberId:subjectMemberId,date,limit:72,
    rawPointCount:Number(day.raw_point_count)||0,
    points:points.map(point=>({latitude:point.latitude,longitude:point.longitude,recordedAt:point.recordedAt,...(point.accuracyMeters===undefined?{}:{accuracyMeters:point.accuracyMeters})})),
    report:stays.results.map(stay=>({
      kind:'STAY',from:String(stay.started_at),to:String(stay.ended_at),minutes:Number(stay.duration_minutes)||0,
      place:String(stay.place_label),archiveStayId:Number(stay.id),
      ...(stay.address_label?{address:String(stay.address_label)}:{}),
      ...(Number.isFinite(Number(stay.anchor_latitude))&&Number.isFinite(Number(stay.anchor_longitude))?{anchor:{latitude:Number(stay.anchor_latitude),longitude:Number(stay.anchor_longitude)}}:{}),
    })),
    reportAvailable:true,reportTruncated:stays.results.length>=100,
  },200,{'cache-control':'no-store'});
}

/** Browser-safe authenticated Location history projection. One-day `date` is
 * the preferred contract. Legacy bounded from/to remains accepted so a rolling
 * deploy cannot break an older client, but the UI only issues one-day reads. */
export async function locationHistoryApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');

  const familyId=Number(requester.family_id);
  const requesterMemberId=Number(requester.id);
  if(!isPositiveId(familyId)||!isPositiveId(requesterMemberId))return fail(403,'FORBIDDEN','参照できません。');

  const url=new URL(request.url);
  const subjectMemberId=Number(url.searchParams.get('memberId')||'');
  if(!isPositiveId(subjectMemberId))return fail(400,'INVALID_MEMBER','memberId が不正です。');
  const date=String(url.searchParams.get('date')||'').trim();
  let from='',to='';
  if(date){
    if(!validDate(date)||date>todayJst())return fail(400,'INVALID_DATE','日付を確認してください。');
    const range=dayRange(date);from=range.from;to=range.to;
    const archive=await readArchivedDay(ctx,familyId,requesterMemberId,subjectMemberId,date);
    if(archive)return await archivedResponse(ctx,familyId,subjectMemberId,date,archive);
  }else{
    from=String(url.searchParams.get('from')||'').trim();
    to=String(url.searchParams.get('to')||'').trim();
    if(!canonicalIso(from)||!canonicalIso(to))return fail(400,'INVALID_RANGE','date または from / to を指定してください。');
    const fromMs=Date.parse(from),toMs=Date.parse(to);
    if(fromMs>toMs||toMs-fromMs>MAX_HISTORY_WINDOW_MS)return fail(400,'INVALID_RANGE','参照期間は31日以内で指定してください。');
  }

  const service=new D1LocationQueryService(ctx.env.DB);
  const points=await service.history({scope:{familyId,requesterMemberId},subjectMemberId,from,to,limit:HISTORY_LIMIT});
  let report:ReturnType<typeof buildLocationStayReport>=[],reportAvailable=true;
  try{report=buildLocationStayReport(points,await readKnownLocationPlaces(ctx.env.DB,familyId)).filter(entry=>entry.kind==='STAY');}
  catch{reportAvailable=false;}
  return json({
    ok:true,archived:false,report:report.slice(0,100),reportAvailable,reportTruncated:report.length>100,
    memberId:subjectMemberId,...(date?{date}:{from,to}),limit:HISTORY_LIMIT,
    points:points.map(point=>({latitude:point.latitude,longitude:point.longitude,recordedAt:point.recordedAt,...(point.accuracyMeters===undefined?{}:{accuracyMeters:point.accuracyMeters})})),
  },200,{'cache-control':'no-store'});
}

export async function locationHistorySearchApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');
  const familyId=Number(requester.family_id),requesterMemberId=Number(requester.id);
  if(!isPositiveId(familyId)||!isPositiveId(requesterMemberId))return fail(403,'FORBIDDEN','参照できません。');
  const url=new URL(request.url),q=String(url.searchParams.get('q')||'').trim(),subjectMemberId=Number(url.searchParams.get('memberId')||'');
  if(q.length<1||q.length>40||/[\r\n\x00-\x1f]/.test(q))return fail(400,'INVALID_QUERY','検索語を1〜40文字で入力してください。');
  if(!isPositiveId(subjectMemberId))return fail(400,'INVALID_MEMBER','家族を選択してください。');
  const rows=await ctx.env.DB.prepare(`
    SELECT s.local_date,s.started_at,s.ended_at,s.duration_minutes,s.place_label,s.address_label
    FROM location_history_stays s
    JOIN members subject ON subject.id=s.member_id AND subject.family_id=s.family_id AND subject.active=1
    WHERE s.family_id=? AND s.member_id=?
      AND EXISTS(SELECT 1 FROM members requester WHERE requester.id=? AND requester.family_id=? AND requester.active=1)
      AND EXISTS(SELECT 1 FROM location_devices d WHERE d.family_id=s.family_id AND d.member_id=s.member_id AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL)
      AND (instr(s.place_label,?)>0 OR instr(COALESCE(s.address_label,''),?)>0)
    ORDER BY s.local_date DESC,s.started_at DESC
    LIMIT ?
  `).bind(familyId,subjectMemberId,requesterMemberId,familyId,q,q,SEARCH_LIMIT).all<Record<string,unknown>>();
  return json({ok:true,memberId:subjectMemberId,q,results:rows.results.map(row=>({
    date:String(row.local_date),from:String(row.started_at),to:String(row.ended_at),minutes:Number(row.duration_minutes)||0,
    label:String(row.address_label||row.place_label||'滞在'),
  }))},200,{'cache-control':'no-store'});
}

export async function locationStayAddressApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');
  const csrf=request.headers.get('x-csrf-token')||'';
  if(!ctx.session.csrfToken||!csrf||!constantTimeEqual(ctx.session.csrfToken,csrf))return fail(403,'CSRF_FAILED','操作を確認できませんでした。');
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>1024)return fail(413,'PAYLOAD_TOO_LARGE','入力が大きすぎます。');
  let body:{archiveStayId?:unknown;addressLabel?:unknown};
  try{body=await request.json() as typeof body;}catch{return fail(400,'BAD_REQUEST','入力を確認してください。');}
  const familyId=Number(requester.family_id),memberId=Number(requester.id),archiveStayId=Number(body.archiveStayId);
  const addressLabel=typeof body.addressLabel==='string'?body.addressLabel.trim():'';
  if(!isPositiveId(familyId)||!isPositiveId(memberId)||!isPositiveId(archiveStayId)||!addressLabel||addressLabel.length>120||/[\r\n\x00-\x1f]/.test(addressLabel))return fail(400,'BAD_REQUEST','住所ラベルを確認してください。');
  await ctx.env.DB.prepare(`
    UPDATE location_history_stays SET address_label=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND family_id=? AND place_label='未登録地点付近'
      AND EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.family_id=? AND m.active=1)
      AND EXISTS(SELECT 1 FROM location_devices d WHERE d.family_id=location_history_stays.family_id AND d.member_id=location_history_stays.member_id AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL)
  `).bind(addressLabel,archiveStayId,familyId,memberId,familyId).run();
  return json({ok:true},200,{'cache-control':'no-store'});
}
