import type { LocationTrigger, NormalizedLocationPoint } from './location-domain';
import { isValidLatitude, isValidLongitude } from './location-domain';

export type OwnTracksNormalizeContext=Readonly<{
  familyId:number;
  memberId:number;
  deviceId:string;
  receivedAt:string;
  maxFutureSkewMs?:number;
}>;

export type OwnTracksNormalizeErrorCode=
  |'INVALID_CONTEXT'
  |'MALFORMED_PAYLOAD'
  |'UNSUPPORTED_TYPE'
  |'INVALID_COORDINATES'
  |'INVALID_TIMESTAMP'
  |'FUTURE_TIMESTAMP'
  |'INVALID_TELEMETRY';

export type OwnTracksNormalizeResult=
  |Readonly<{ok:true;point:NormalizedLocationPoint}>
  |Readonly<{ok:false;code:OwnTracksNormalizeErrorCode}>;

const DEFAULT_MAX_FUTURE_SKEW_MS=5*60*1000;
const MAX_DEVICE_ID_LENGTH=128;

type JsonObject=Record<string,unknown>;

const isObject=(value:unknown):value is JsonObject=>
  typeof value==='object'&&value!==null&&!Array.isArray(value);

const safeContext=(context:OwnTracksNormalizeContext):boolean=>{
  if(!Number.isSafeInteger(context.familyId)||context.familyId<=0)return false;
  if(!Number.isSafeInteger(context.memberId)||context.memberId<=0)return false;
  const deviceId=context.deviceId.trim();
  if(!deviceId||deviceId.length>MAX_DEVICE_ID_LENGTH||/[\u0000-\u001f\u007f]/.test(deviceId))return false;
  const receivedMs=Date.parse(context.receivedAt);
  if(!Number.isFinite(receivedMs))return false;
  const skew=context.maxFutureSkewMs??DEFAULT_MAX_FUTURE_SKEW_MS;
  return Number.isFinite(skew)&&skew>=0;
};

const finiteOptional=(payload:JsonObject,key:string):number|undefined|null=>{
  const value=payload[key];
  if(value===undefined)return undefined;
  return typeof value==='number'&&Number.isFinite(value)?value:null;
};

const normalizeTrigger=(value:unknown):LocationTrigger=>{
  if(value===undefined)return 'MOVE';
  if(value==='p'||value==='r')return 'PING';
  if(value==='u')return 'MANUAL';
  if(value==='t'||value==='v')return 'MOVE';
  // OwnTracks region/beacon location reports do not contain enter/leave
  // direction. The corresponding `_type=transition` adapter will own that.
  return 'UNKNOWN';
};

/**
 * Converts an OwnTracks `_type=location` payload into the provider-neutral
 * domain point. Family/member/device identity is authoritative server context;
 * it is never taken from the untrusted payload.
 *
 * The result intentionally contains only normalized fields and fixed error
 * codes so callers never need to surface or log raw location payload content.
 */
export const normalizeOwnTracksLocation=(
  payload:unknown,
  context:OwnTracksNormalizeContext,
):OwnTracksNormalizeResult=>{
  if(!safeContext(context))return {ok:false,code:'INVALID_CONTEXT'};
  if(!isObject(payload))return {ok:false,code:'MALFORMED_PAYLOAD'};
  if(payload._type!=='location')return {ok:false,code:'UNSUPPORTED_TYPE'};

  const latitude=payload.lat;
  const longitude=payload.lon;
  if(typeof latitude!=='number'||typeof longitude!=='number'||
    !isValidLatitude(latitude)||!isValidLongitude(longitude)){
    return {ok:false,code:'INVALID_COORDINATES'};
  }

  const tst=payload.tst;
  if(!Number.isSafeInteger(tst)||typeof tst!=='number'||tst<=0){
    return {ok:false,code:'INVALID_TIMESTAMP'};
  }
  const recordedMs=tst*1000;
  const receivedMs=Date.parse(context.receivedAt);
  const maxFutureSkewMs=context.maxFutureSkewMs??DEFAULT_MAX_FUTURE_SKEW_MS;
  if(recordedMs>receivedMs+maxFutureSkewMs){
    return {ok:false,code:'FUTURE_TIMESTAMP'};
  }

  const accuracy=finiteOptional(payload,'acc');
  const altitude=finiteOptional(payload,'alt');
  const velocityKmh=finiteOptional(payload,'vel');
  const heading=finiteOptional(payload,'cog');
  const battery=finiteOptional(payload,'batt');
  if(accuracy===null||accuracy!==undefined&&accuracy<0||
    altitude===null||
    velocityKmh===null||velocityKmh!==undefined&&velocityKmh<0||
    heading===null||heading!==undefined&&(heading<0||heading>360)||
    battery===null||battery!==undefined&&battery!==-1&&(battery<0||battery>100)){
    return {ok:false,code:'INVALID_TELEMETRY'};
  }

  const point:NormalizedLocationPoint={
    provider:'OWNTRACKS',
    familyId:context.familyId,
    memberId:context.memberId,
    deviceId:context.deviceId.trim(),
    latitude,
    longitude,
    recordedAt:new Date(recordedMs).toISOString(),
    receivedAt:new Date(receivedMs).toISOString(),
    trigger:normalizeTrigger(payload.t),
    ...(accuracy===undefined?{}:{accuracyMeters:accuracy}),
    ...(altitude===undefined?{}:{altitudeMeters:altitude}),
    ...(velocityKmh===undefined?{}:{speedMetersPerSecond:velocityKmh/3.6}),
    ...(heading===undefined?{}:{headingDegrees:heading}),
    ...(battery===undefined||battery===-1?{}:{batteryPercent:battery}),
  };
  return {ok:true,point};
};
