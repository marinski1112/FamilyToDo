import type { AppContext } from './app-context';
import { D1LocationQueryService } from './location-query-service';
import { readKnownLocationPlaces } from './location-places-api';
import type { LocationPoint } from './location-providers';
import { locationDistance,placePresence,type KnownLocationPlace } from './location-stay-report';
import { json } from './response';

type FamilyMemberRow=Readonly<{
  id:unknown;
  name:unknown;
  sharing_enabled:unknown;
}>;
type HomeRow=Readonly<{
  latitude:unknown;
  longitude:unknown;
  accuracy_meters:unknown;
}>;

type LocationFreshness='FRESH'|'AGING'|'STALE'|'NO_LOCATION'|'SHARING_OFF';
type HomePresence='HOME'|'AWAY'|'UNKNOWN'|'NO_HOME';
type HomePresenceReason='HOME_CONFIRMED'|'AWAY_CONFIRMED'|'HOME_NOT_CONFIGURED'|'SHARING_OFF'|'NO_LOCATION'|'STALE_LOCATION'|'LOCATION_ACCURACY_MISSING'|'HOME_ACCURACY_MISSING'|'INVALID_DISTANCE'|'ACCURACY_OVERLAP';
type DisplayPlaceConfidence='CONFIRMED'|'LOW_ACCURACY_NEARBY';
type CoordinatePoint=Readonly<{latitude:number;longitude:number}>;
type PresencePoint=CoordinatePoint&Readonly<{accuracyMeters?:number}>;
type HomePresenceProjection=Readonly<{status:HomePresence;reason:HomePresenceReason}>;
type DisplayPlaceProjection=Readonly<{place:KnownLocationPlace;confidence:DisplayPlaceConfidence;distanceMeters:number}>;

const HOME_RADIUS_METERS=150;
const DISPLAY_PLACE_RADIUS_METERS=150;
const MAX_DISPLAY_ACCURACY_METERS=3000;
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

function homePoint(row:HomeRow|null):PresencePoint|null{
  if(!row)return null;
  const latitude=Number(row.latitude),longitude=Number(row.longitude),accuracyMeters=Number(row.accuracy_meters);
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)return null;
  return {
    latitude,
    longitude,
    ...(row.accuracy_meters===null||row.accuracy_meters===undefined||!Number.isFinite(accuracyMeters)||accuracyMeters<0?{}:{accuracyMeters}),
  };
}

function classifyHomePresenceAtPoint(point:PresencePoint|null,home:PresencePoint|null):HomePresenceProjection{
  if(!home)return {status:'NO_HOME',reason:'HOME_NOT_CONFIGURED'};
  if(!point)return {status:'UNKNOWN',reason:'NO_LOCATION'};
  const pointAccuracy=point.accuracyMeters;
  const homeAccuracy=home.accuracyMeters;
  if(pointAccuracy===undefined||!Number.isFinite(pointAccuracy))return {status:'UNKNOWN',reason:'LOCATION_ACCURACY_MISSING'};
  if(homeAccuracy===undefined||!Number.isFinite(homeAccuracy))return {status:'UNKNOWN',reason:'HOME_ACCURACY_MISSING'};
  const distance=straightLineDistanceMeters(point,home);
  if(distance===null)return {status:'UNKNOWN',reason:'INVALID_DISTANCE'};
  const uncertainty=Math.max(0,pointAccuracy)+Math.max(0,homeAccuracy);
  if(distance+uncertainty<=HOME_RADIUS_METERS)return {status:'HOME',reason:'HOME_CONFIRMED'};
  if(distance-uncertainty>HOME_RADIUS_METERS)return {status:'AWAY',reason:'AWAY_CONFIRMED'};
  return {status:'UNKNOWN',reason:'ACCURACY_OVERLAP'};
}

function homePresence(point:PresencePoint|null,state:LocationFreshness,home:PresencePoint|null):HomePresenceProjection{
  if(!home)return {status:'NO_HOME',reason:'HOME_NOT_CONFIGURED'};
  if(state==='SHARING_OFF')return {status:'UNKNOWN',reason:'SHARING_OFF'};
  if(!point||state==='NO_LOCATION')return {status:'UNKNOWN',reason:'NO_LOCATION'};
  if(state==='STALE')return {status:'UNKNOWN',reason:'STALE_LOCATION'};
  return classifyHomePresenceAtPoint(point,home);
}

function displayPlaceCandidate(point:LocationPoint|null,places:readonly KnownLocationPlace[]):DisplayPlaceProjection|null{
  if(!point)return null;
  const pointAccuracy=Number(point.accuracyMeters);
  const usableAccuracy=Number.isFinite(pointAccuracy)&&pointAccuracy>=0&&pointAccuracy<=MAX_DISPLAY_ACCURACY_METERS?pointAccuracy:null;
  let selected:DisplayPlaceProjection|null=null;
  for(const place of places){
    if(!place.key.startsWith('N:'))continue;
    const distance=locationDistance(point,place);
    if(!Number.isFinite(distance))continue;
    const strict=placePresence(point,place);
    if(strict==='IN'){
      if(!selected||selected.confidence!=='CONFIRMED'||distance<selected.distanceMeters)selected={place,confidence:'CONFIRMED',distanceMeters:distance};
      continue;
    }
    if(selected?.confidence==='CONFIRMED'||usableAccuracy===null)continue;
    const placeAccuracy=Number(place.accuracyMeters);
    const storedAccuracy=Number.isFinite(placeAccuracy)&&placeAccuracy>=0?Math.min(placeAccuracy,100):0;
    const overlapLimit=DISPLAY_PLACE_RADIUS_METERS+usableAccuracy+storedAccuracy;
    if(distance<=overlapLimit&&(!selected||distance<selected.distanceMeters))selected={place,confidence:'LOW_ACCURACY_NEARBY',distanceMeters:distance};
  }
  return selected;
}

function homeDisplayNearbyLowAccuracy(point:LocationPoint|null,home:PresencePoint|null,presence:HomePresenceProjection):boolean{
  if(!point||!home||presence.status==='HOME'||presence.reason!=='ACCURACY_OVERLAP')return false;
  const pointAccuracy=Number(point.accuracyMeters),homeAccuracy=Number(home.accuracyMeters);
  if(!Number.isFinite(pointAccuracy)||pointAccuracy<0||pointAccuracy>MAX_DISPLAY_ACCURACY_METERS)return false;
  const distance=straightLineDistanceMeters(point,home);
  if(distance===null)return false;
  const storedAccuracy=Number.isFinite(homeAccuracy)&&homeAccuracy>=0?Math.min(homeAccuracy,100):0;
  return distance<=HOME_RADIUS_METERS+pointAccuracy+storedAccuracy;
}

/**
 * Browser-safe authenticated Location projection for the family map surface.
 *
 * Member/device lookup exposes only presentation state needed by the map. The
 * provider-neutral D1LocationQueryService remains the only coordinate read
 * boundary, so disabled/share-off/revoked sources and cross-family rows fail
 * closed. Device IDs, provider payloads, credentials and other internal sensor
 * metadata never enter the response. HOME presence remains the strict derived
 * projection used to avoid asserting presence from uncertain points. A separate
 * display-only nearby hint may be returned for a coarse current fix whose error
 * circle overlaps HOME or a named place. Stay/journal/arrival semantics continue
 * to use placePresence unchanged and never consume the display-only hint.
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
  const homeRow=await ctx.env.DB.prepare(`
    SELECT latitude,longitude,accuracy_meters
    FROM family_location_places
    WHERE family_id=? AND kind='HOME'
    LIMIT 1
  `).bind(familyId).first<HomeRow>();
  const home=homePoint(homeRow);
  const knownPlaces=await readKnownLocationPlaces(ctx.env.DB,familyId);

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
    const presence=homePresence(point,safeFreshness.state,home);
    const stalePointPresence=safeFreshness.state==='STALE'?classifyHomePresenceAtPoint(point,home):null;
    const lastKnownHomePresence=stalePointPresence&&(stalePointPresence.status==='HOME'||stalePointPresence.status==='AWAY')
      ?stalePointPresence.status
      :null;
    const displayPlace=displayPlaceCandidate(point,knownPlaces);
    members.push({
      memberId:subjectMemberId,
      isViewer:subjectMemberId===requesterMemberId,
      name:String(row.name??''),
      sharingEnabled,
      state:safeFreshness.state,
      ageMinutes:safeFreshness.ageMinutes,
      distanceMetersFromViewer,
      homePresence:presence.status,
      homePresenceReason:presence.reason,
      homeDisplayNearbyLowAccuracy:homeDisplayNearbyLowAccuracy(point,home,presence),
      lastKnownHomePresence,
      registeredPlaceLabel:displayPlace?.confidence==='CONFIRMED'?displayPlace.place.label:null,
      displayNearbyPlaceLabel:displayPlace?.confidence==='LOW_ACCURACY_NEARBY'?displayPlace.place.label:null,
      displayNearbyPlaceDistanceMeters:displayPlace?.confidence==='LOW_ACCURACY_NEARBY'?Math.round(displayPlace.distanceMeters):null,
      latest:point?{
        latitude:point.latitude,
        longitude:point.longitude,
        recordedAt:point.recordedAt,
        ...(point.accuracyMeters===undefined?{}:{accuracyMeters:point.accuracyMeters}),
      }:null,
    });
  }

  return json({ok:true,homeConfigured:Boolean(home),homeRadiusMeters:HOME_RADIUS_METERS,members},200,{'cache-control':'no-store'});
}
