import { verifyLocationDeviceCredential } from './location-device-auth';
import { isValidLatitude, isValidLongitude, type NormalizedLocationPoint } from './location-domain';
import { persistAuthenticatedLocationPoint } from './location-persistence';
import { processLocationArrival } from './location-arrival-push';
import { json } from './response';

const MAX_BODY_BYTES=4096;
const unauthorized=()=>json({ok:false,code:'AUTH_REQUIRED'},401,{'cache-control':'no-store'});

/** One sensor point per request. Identity comes exclusively from the device credential. */
export async function androidLocationIngress(request:Request,env:Env,execution?:ExecutionContext):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
  const header=request.headers.get('authorization')||'';
  const match=/^Bearer (loc_[0-9a-f]{32}):([0-9a-f]{64})$/i.exec(header);
  if(!match)return unauthorized();
  const device=await verifyLocationDeviceCredential(env.DB,match[1],match[2]);
  if(!device||device.provider!=='FAMILYTODO_ANDROID')return unauthorized();
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY_BYTES))return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);
  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);
  let value:unknown;
  try{value=JSON.parse(body);}catch{return json({ok:false,code:'INVALID_JSON'},400);}
  if(!value||typeof value!=='object'||Array.isArray(value))return json({ok:false,code:'INVALID_LOCATION'},400);
  const input=value as Record<string,unknown>;
  const latitude=input.latitude,longitude=input.longitude,recordedAt=input.recordedAt,accuracy=input.accuracyMeters;
  const recordedMs=typeof recordedAt==='string'?Date.parse(recordedAt):NaN;
  const receivedMs=Date.now();
  if(typeof latitude!=='number'||!isValidLatitude(latitude)||typeof longitude!=='number'||!isValidLongitude(longitude)||
    typeof recordedAt!=='string'||!Number.isFinite(recordedMs)||new Date(recordedMs).toISOString()!==recordedAt||
    recordedMs>receivedMs+5*60_000||recordedMs<receivedMs-24*60*60_000||
    typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<0||accuracy>10_000){
    return json({ok:false,code:'INVALID_LOCATION'},400);
  }
  const point:NormalizedLocationPoint={
    provider:'FAMILYTODO_ANDROID',familyId:device.familyId,memberId:device.memberId,deviceId:device.publicId,
    latitude,longitude,recordedAt,receivedAt:new Date(receivedMs).toISOString(),accuracyMeters:accuracy,trigger:'MOVE',
  };
  if(!await persistAuthenticatedLocationPoint(env.DB,device,point))return unauthorized();
  execution?.waitUntil(processLocationArrival(env,point).catch(()=>{}));
  return json({ok:true},200,{'cache-control':'no-store'});
}
