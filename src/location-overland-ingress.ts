import { verifyLocationDeviceCredential } from './location-device-auth';
import { normalizeOverlandLocations } from './location-overland';
import { persistAuthenticatedLocationPoint } from './location-persistence';
import { processLocationArrival } from './location-arrival-push';
import { json } from './response';

const MAX_BODY_BYTES=256*1024;
const BEARER_PREFIX='Bearer ';
type BearerCredential=Readonly<{publicId:string;secret:string}>;

const unauthorized=()=>json({ok:false,code:'AUTH_REQUIRED'},401,{'www-authenticate':'Bearer realm="FamilyToDo Location"'});

/** Overland exposes one Bearer-token field, so encode the existing one-time
 * FamilyToDo credential as `publicId:secret`. It stays in the Authorization
 * header and never enters the URL/query string. */
const parseBearerCredential=(request:Request):BearerCredential|null=>{
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith(BEARER_PREFIX))return null;
  const token=header.slice(BEARER_PREFIX.length).trim();
  const separator=token.indexOf(':');
  if(separator<=0)return null;
  const publicId=token.slice(0,separator).trim();
  const secret=token.slice(separator+1);
  return publicId&&secret?{publicId,secret}:null;
};

const declaredBodyTooLarge=(request:Request):boolean=>{
  const raw=request.headers.get('content-length');
  if(raw===null)return false;
  if(!/^\d+$/.test(raw))return true;
  const length=Number(raw);
  return !Number.isSafeInteger(length)||length>MAX_BODY_BYTES;
};

/** Public Overland batch receiver. Raw GeoJSON and credentials are never logged. */
export async function overlandLocationIngress(request:Request,env:Env,execution?:ExecutionContext):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
  if(declaredBodyTooLarge(request))return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);
  const credential=parseBearerCredential(request);
  if(!credential)return unauthorized();
  const device=await verifyLocationDeviceCredential(env.DB,credential.publicId,credential.secret);
  // Overland intentionally reuses the existing iPhone Location credential class.
  if(!device||device.provider!=='OWNTRACKS')return unauthorized();

  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);
  let payload:unknown;
  try{payload=JSON.parse(body);}catch{return json({ok:false,code:'INVALID_JSON'},400);}

  const normalized=normalizeOverlandLocations(payload,{
    familyId:device.familyId,
    memberId:device.memberId,
    deviceId:device.publicId,
    receivedAt:new Date().toISOString(),
  });
  if(!normalized.ok)return json({ok:false,code:normalized.code},400);

  const accepted=[];
  for(const point of normalized.points){
    const persisted=await persistAuthenticatedLocationPoint(env.DB,device,point);
    if(!persisted)return unauthorized();
    accepted.push(point);
  }
  if(execution&&accepted.length>0){
    execution.waitUntil(Promise.all(accepted.map(point=>processLocationArrival(env,point).catch(()=>{}))).then(()=>{}));
  }
  // Overland only clears its local queue by default when the response contains
  // {"result":"ok"}. Keep FamilyToDo metadata while honoring that contract.
  return json({result:'ok',ok:true,accepted:accepted.length});
}
