import type { AppContext } from './app-context';
import { D1LocationQueryService } from './location-query-service';
import { json } from './response';

type FamilyMemberRow=Readonly<{
  id:unknown;
  name:unknown;
  sharing_enabled:unknown;
}>;

type LocationFreshness='FRESH'|'AGING'|'STALE'|'NO_LOCATION'|'SHARING_OFF';
type CoordinatePoint=Readonly<{latitude:number;longitude:number}>;

const isPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const toRadians=(degrees:number):number=>degrees*Math.PI/180;

function fail(status:number,code:string,message:string):Response{
  return json({ok:false,error:message,code},status,{'cache-control':'no-store'});
}

function freshness(recordedAt:string|null,sharingEnabled:boolean,nowMs:number):Readonly<{state:LocationFreshness;ageMinutes:number|null}>{
  if(!sharingEnabled)return {state:'SHARING_OFF',ageMinutes:null};
  if(!recordedAt)return {state:'NO_LOCATION',ageMinutes:null};
  const recordedMs=Date.parse(recordedAt);
  if(!Number.isFinite(recordedMs))return {state:'NO_LOCATION',ageMinutes:null};
  const ageMinutes=Math.max(0,Math.floor((nowMs-recordedMs)/60000));
  if(ageMinutes<=5)return {state:'FRESH',ageMinutes};
  if(ageMinutes<=30)return {state:'AGING',ageMinutes};
  return {state:'STALE',ageMinutes};
}

function straightLineDistanceMeters(from:CoordinatePoint,to:CoordinatePoint):number|null{
  const values=[from.latitude,from.longitude,to.latitude,to.longitude];
  if(values.some((value)=>!Number.isFinite(value)))return null;
  if(Math.abs(from.latitude)>90||Math.abs(to.latitude)>90||Math.abs(from.longitude)>180||Math.abs(to.longitude)>180)return null;
  const earthRadiusMeters=6371000;
  const latitudeDelta=toRadians(to.latitude-from.latitude);
  const longitudeDelta=toRadians(to.longitude-from.longitude);
  const fromLatitude=toRadians(from.latitude);
  const toLatitude=toRadians(to.latitude);
  const haversine=Math.sin(latitudeDelta/2)**2+Math.cos(fromLatitude)*Math.cos(toLatitude)*Math.sin(longitudeDelta/2)**2;
  const angularDistance=2*Math.atan2(Math.sqrt(haversine),Math.sqrt(Math.max(0,1-haversine)));
  return Math.round(earthRadiusMeters*angularDistance);
}

/**
 * Browser-safe authenticated Location projection for the family map surface.
 *
 * Member/device lookup exposes only presentation state needed by the map. The
 * provider-neutral D1LocationQueryService remains the only coordinate read
 * boundary, so disabled/share-off/revoked sources and cross-family rows fail
 * closed. Device IDs, provider payloads, credentials and other internal sensor
 * metadata never enter the response.
 */
export async function locationLatestApi(request:Request,ctx:AppContext):Promise<Response>{
  const requester=ctx.member;
  if(!requester)return fail(401,'AUTH_REQUIRED','ログインが必要です。');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Method Not Allowed');

  const familyId=Number(requester.family_id);
  const requesterMemberId=Number(requester.id);
  if(!isPositiveId(familyId)||!isPositiveId(requesterMemberId))return fail(403,'FORBIDDEN','参照できません。');

  const rows=await ctx.env.DB.prepare(`
    SELECT m.id,m.name,
      CASE WHEN EXISTS (
        SELECT 1
        FROM location_devices d
        WHERE d.family_id=m.family_id
          AND d.member_id=m.id
          AND d.enabled=1
          AND d.sharing_enabled=1
          AND d.revoked_at IS NULL
      ) THEN 1 ELSE 0 END AS sharing_enabled
    FROM members m
    WHERE m.family_id=? AND m.active=1
    ORDER BY m.id ASC
  `).bind(familyId).all<FamilyMemberRow>();

  const service=new D1LocationQueryService(ctx.env.DB);
  const nowMs=Date.now();
  const requesterRow=rows.results.find((row)=>Number(row.id)===requesterMemberId);
  const requesterSharingEnabled=Number(requesterRow?.sharing_enabled)===1;
  const requesterPoint=requesterSharingEnabled?await service.latest({
    scope:{familyId,requesterMemberId},
    subjectMemberId:requesterMemberId,
  }):null;
  const members=[];

  for(const row of rows.results){
    const subjectMemberId=Number(row.id);
    if(!isPositiveId(subjectMemberId))continue;
    const sharingEnabled=Number(row.sharing_enabled)===1;
    const point=sharingEnabled
      ?(subjectMemberId===requesterMemberId?requesterPoint:await service.latest({
        scope:{familyId,requesterMemberId},
        subjectMemberId,
      }))
      :null;
    const safeFreshness=freshness(point?.recordedAt??null,sharingEnabled,nowMs);
    const distanceMetersFromViewer=subjectMemberId!==requesterMemberId&&requesterPoint&&point
      ?straightLineDistanceMeters(requesterPoint,point)
      :null;
    members.push({
      name:String(row.name??''),
      sharingEnabled,
      state:safeFreshness.state,
      ageMinutes:safeFreshness.ageMinutes,
      distanceMetersFromViewer,
      latest:point?{
        latitude:point.latitude,
        longitude:point.longitude,
        recordedAt:point.recordedAt,
        ...(point.accuracyMeters===undefined?{}:{accuracyMeters:point.accuracyMeters}),
      }:null,
    });
  }

  return json({ok:true,members},200,{'cache-control':'no-store'});
}
