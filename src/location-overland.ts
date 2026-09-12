import type { NormalizedLocationPoint } from './location-domain';
import { isValidLatitude, isValidLongitude } from './location-domain';

export type OverlandNormalizeContext=Readonly<{
  familyId:number;
  memberId:number;
  deviceId:string;
  receivedAt:string;
  maxFutureSkewMs?:number;
}>;

export type OverlandNormalizeResult=
  |Readonly<{ok:true;points:readonly NormalizedLocationPoint[]}>
  |Readonly<{ok:false;code:'INVALID_CONTEXT'|'MALFORMED_PAYLOAD'|'TOO_MANY_LOCATIONS'|'INVALID_LOCATION'}>;

const DEFAULT_MAX_FUTURE_SKEW_MS=5*60*1000;
export const MAX_OVERLAND_LOCATIONS=250;
type JsonObject=Record<string,unknown>;
const isObject=(value:unknown):value is JsonObject=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const finite=(value:unknown):number|undefined=>typeof value==='number'&&Number.isFinite(value)?value:undefined;

const validContext=(context:OverlandNormalizeContext):boolean=>
  Number.isSafeInteger(context.familyId)&&context.familyId>0&&
  Number.isSafeInteger(context.memberId)&&context.memberId>0&&
  context.deviceId.trim().length>0&&context.deviceId.length<=128&&
  Number.isFinite(Date.parse(context.receivedAt));

const normalizeOne=(feature:unknown,context:OverlandNormalizeContext):NormalizedLocationPoint|null=>{
  if(!isObject(feature)||feature.type!=='Feature'||!isObject(feature.geometry)||feature.geometry.type!=='Point'||!Array.isArray(feature.geometry.coordinates)||!isObject(feature.properties))return null;
  const coordinates=feature.geometry.coordinates;
  if(coordinates.length<2)return null;
  const longitude=coordinates[0];
  const latitude=coordinates[1];
  if(typeof longitude!=='number'||typeof latitude!=='number'||!isValidLongitude(longitude)||!isValidLatitude(latitude))return null;

  const timestamp=feature.properties.timestamp;
  if(typeof timestamp!=='string')return null;
  const recordedMs=Date.parse(timestamp);
  const receivedMs=Date.parse(context.receivedAt);
  const maxFutureSkewMs=context.maxFutureSkewMs??DEFAULT_MAX_FUTURE_SKEW_MS;
  if(!Number.isFinite(recordedMs)||recordedMs<=0||recordedMs>receivedMs+maxFutureSkewMs)return null;

  const accuracy=finite(feature.properties.horizontal_accuracy);
  const altitude=finite(feature.properties.altitude);
  const speed=finite(feature.properties.speed);
  const course=finite(feature.properties.course);
  const batteryRaw=finite(feature.properties.battery_level);
  if((accuracy!==undefined&&accuracy<0)||(speed!==undefined&&speed<0)||(course!==undefined&&(course<0||course>360))||(batteryRaw!==undefined&&(batteryRaw<0||batteryRaw>100)))return null;
  const battery=batteryRaw===undefined?undefined:(batteryRaw<=1?batteryRaw*100:batteryRaw);

  return {
    // Overland and OwnTracks intentionally share one FamilyToDo iPhone-location
    // credential class today. Server-side identity comes from that credential,
    // never from Overland's untrusted device_id property.
    provider:'OWNTRACKS',
    familyId:context.familyId,
    memberId:context.memberId,
    deviceId:context.deviceId.trim(),
    latitude,
    longitude,
    recordedAt:new Date(recordedMs).toISOString(),
    receivedAt:new Date(receivedMs).toISOString(),
    trigger:'MOVE',
    ...(accuracy===undefined?{}:{accuracyMeters:accuracy}),
    ...(altitude===undefined?{}:{altitudeMeters:altitude}),
    ...(speed===undefined?{}:{speedMetersPerSecond:speed}),
    ...(course===undefined?{}:{headingDegrees:course}),
    ...(battery===undefined?{}:{batteryPercent:battery}),
  };
};

/** Normalize Overland's GeoJSON batch without retaining raw payload metadata. */
export const normalizeOverlandLocations=(payload:unknown,context:OverlandNormalizeContext):OverlandNormalizeResult=>{
  if(!validContext(context))return {ok:false,code:'INVALID_CONTEXT'};
  if(!isObject(payload)||!Array.isArray(payload.locations)||payload.locations.length===0)return {ok:false,code:'MALFORMED_PAYLOAD'};
  if(payload.locations.length>MAX_OVERLAND_LOCATIONS)return {ok:false,code:'TOO_MANY_LOCATIONS'};
  const points:NormalizedLocationPoint[]=[];
  for(const feature of payload.locations){
    const point=normalizeOne(feature,context);
    if(!point)return {ok:false,code:'INVALID_LOCATION'};
    points.push(point);
  }
  points.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  return {ok:true,points};
};
