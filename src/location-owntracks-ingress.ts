import { verifyLocationDeviceCredential } from './location-device-auth';
import { normalizeOwnTracksLocation } from './location-owntracks';
import { persistAuthenticatedLocationPoint } from './location-persistence';
import { json } from './response';

const MAX_BODY_BYTES=16*1024;
const BASIC_PREFIX='Basic ';

type BasicCredential=Readonly<{publicId:string;secret:string}>;

const unauthorized=()=>json(
  {ok:false,code:'AUTH_REQUIRED'},
  401,
  {'www-authenticate':'Basic realm="FamilyToDo Location"'},
);

const parseBasicCredential=(request:Request):BasicCredential|null=>{
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith(BASIC_PREFIX))return null;
  const encoded=header.slice(BASIC_PREFIX.length).trim();
  if(!encoded)return null;
  try{
    const decoded=atob(encoded);
    const separator=decoded.indexOf(':');
    if(separator<=0)return null;
    const publicId=decoded.slice(0,separator).trim();
    const secret=decoded.slice(separator+1);
    if(!publicId||!secret)return null;
    return {publicId,secret};
  }catch{
    return null;
  }
};

const declaredBodyTooLarge=(request:Request):boolean=>{
  const raw=request.headers.get('content-length');
  if(raw===null)return false;
  if(!/^\d+$/.test(raw))return true;
  const length=Number(raw);
  return !Number.isSafeInteger(length)||length>MAX_BODY_BYTES;
};

/**
 * Public OwnTracks HTTP-mode ingestion boundary.
 *
 * OwnTracks HTTP mode natively supports TLS + HTTP Basic authentication. The
 * generated FamilyToDo Location device public ID is used as the Basic username
 * and its one-time secret as the password. No credential is accepted from the
 * URL/query string. Raw request bodies, credentials and coordinates are never
 * logged here.
 */
export async function ownTracksLocationIngress(request:Request,env:Env):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
  if(declaredBodyTooLarge(request))return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);

  const credential=parseBasicCredential(request);
  if(!credential)return unauthorized();
  const device=await verifyLocationDeviceCredential(env.DB,credential.publicId,credential.secret);
  if(!device||device.provider!=='OWNTRACKS')return unauthorized();

  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413);
  // OwnTracks may POST an empty body when a friend is deleted. Treat it as an
  // authenticated no-op so the app does not queue an irrelevant retry.
  if(body.length===0)return json([]);

  let payload:unknown;
  try{payload=JSON.parse(body);}catch{return json({ok:false,code:'INVALID_JSON'},400);}

  const receivedAt=new Date().toISOString();
  const normalized=normalizeOwnTracksLocation(payload,{
    familyId:device.familyId,
    memberId:device.memberId,
    deviceId:device.publicId,
    receivedAt,
  });
  if(!normalized.ok)return json({ok:false,code:'INVALID_LOCATION'},400);

  const persisted=await persistAuthenticatedLocationPoint(env.DB,device,normalized.point);
  if(!persisted)return unauthorized();
  return json([]);
}
