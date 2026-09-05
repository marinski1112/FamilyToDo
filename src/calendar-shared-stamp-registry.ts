export const FAMILY_SHARED_STAMP_MAX_EDGE=384;
export const FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES=1024*1024;
export const FAMILY_SHARED_STAMP_MAX_FRAMES=48;

export type FamilySharedStampKind='STATIC'|'ANIMATED';
export type FamilySharedStampRepresentation='SINGLE_FILE'|'FRAME_SEQUENCE';
export type FamilySharedStampMimeType='image/png'|'image/webp'|'image/gif'|'image/jpeg';

export type FamilySharedStampCatalogItem={
  sharedId:string;
  name:string;
  currentVersion:number;
  enabled:true;
  kind:FamilySharedStampKind;
  representation:FamilySharedStampRepresentation;
  mimeType:FamilySharedStampMimeType;
  width:number;
  height:number;
  normalizedByteSize:number;
  contentPath:string|null;
  thumbnailPath:string|null;
  framesPath:string|null;
  updatedAt:number;
};

export type FamilySharedStampManifest={
  sharedId:string;
  version:number;
  name:string;
  kind:FamilySharedStampKind;
  representation:FamilySharedStampRepresentation;
  mimeType:FamilySharedStampMimeType;
  storageKey:string|null;
  thumbnailStorageKey:string|null;
  width:number;
  height:number;
  normalizedByteSize:number;
  frames:Array<{storageKey:string;durationMs:number;width:number;height:number}>;
};

export type FamilySharedStampRegistryConfig={baseUrl:string;token:string;fetchImpl?:typeof fetch};

const SHARED_ID_RE=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const PUBLIC_STAMP_PATH_RE=/^\/v1\/stamps\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/versions\/([1-9]\d*)\/(content|thumbnail|frames(?:\/(?:0|[1-3]?\d|4[0-7]))?)$/u;

function normalizeBaseUrl(raw:unknown):string{
  const value=String(raw??'').trim().replace(/\/+$/u,'');
  if(!value)throw new TypeError('shared stamp service URL is required');
  const url=new URL(value);
  if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new TypeError('shared stamp service must use https');
  if(url.username||url.password||url.search||url.hash)throw new TypeError('invalid shared stamp service URL');
  return url.toString().replace(/\/$/u,'');
}

function positiveInt(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>0;}
function safePublicPath(value:unknown):value is string|null{
  return value===null||(typeof value==='string'&&PUBLIC_STAMP_PATH_RE.test(value));
}

function parseCatalogItem(value:unknown):FamilySharedStampCatalogItem{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('invalid shared stamp catalog item');
  const item=value as Record<string,unknown>;
  if(typeof item.sharedId!=='string'||!SHARED_ID_RE.test(item.sharedId))throw new TypeError('invalid shared stamp id');
  if(typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>100)throw new TypeError('invalid shared stamp name');
  if(!positiveInt(item.currentVersion))throw new TypeError('invalid shared stamp version');
  if(item.enabled!==true)throw new TypeError('invalid shared stamp enabled state');
  if(item.kind!=='STATIC'&&item.kind!=='ANIMATED')throw new TypeError('invalid shared stamp kind');
  if(item.representation!=='SINGLE_FILE'&&item.representation!=='FRAME_SEQUENCE')throw new TypeError('invalid shared stamp representation');
  if(!['image/png','image/webp','image/gif','image/jpeg'].includes(String(item.mimeType)))throw new TypeError('invalid shared stamp mime type');
  if(!positiveInt(item.width)||!positiveInt(item.height)||Math.max(Number(item.width),Number(item.height))>FAMILY_SHARED_STAMP_MAX_EDGE)throw new TypeError('invalid shared stamp dimensions');
  if(!positiveInt(item.normalizedByteSize)||Number(item.normalizedByteSize)>FAMILY_SHARED_STAMP_MAX_NORMALIZED_BYTES)throw new TypeError('invalid shared stamp byte size');
  if(!safePublicPath(item.contentPath)||!safePublicPath(item.thumbnailPath)||!safePublicPath(item.framesPath))throw new TypeError('invalid shared stamp content path');
  if(!Number.isSafeInteger(item.updatedAt)||Number(item.updatedAt)<0)throw new TypeError('invalid shared stamp updated time');

  const prefix=`/v1/stamps/${item.sharedId}/versions/${item.currentVersion}`;
  const expectedContent=item.representation==='SINGLE_FILE'?`${prefix}/content`:null;
  const expectedFrames=item.representation==='FRAME_SEQUENCE'?`${prefix}/frames`:null;
  if(item.contentPath!==expectedContent||item.framesPath!==expectedFrames)throw new TypeError('shared stamp catalog path mismatch');
  if(item.thumbnailPath!==null&&item.thumbnailPath!==`${prefix}/thumbnail`)throw new TypeError('shared stamp thumbnail path mismatch');
  return item as FamilySharedStampCatalogItem;
}

async function parseJson(response:Response):Promise<unknown>{
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`shared stamp service request failed (${response.status})`);
  return body;
}

function multipart(manifest:FamilySharedStampManifest,parts:{content?:File;thumbnail?:File;frames?:File[]}):FormData{
  const form=new FormData();
  form.set('manifest',JSON.stringify(manifest));
  if(parts.content)form.set('content',parts.content);
  if(parts.thumbnail)form.set('thumbnail',parts.thumbnail);
  for(const [index,frame] of (parts.frames??[]).entries())form.set(`frame-${index}`,frame);
  return form;
}

export function familySharedStampRegistryConfigFromEnv(env:{
  SHARED_STAMPS_SERVICE_URL?:string;
  SHARED_STAMPS_SERVICE_TOKEN?:string;
  SHARED_STAMPS_SERVICE?:{fetch(request:Request):Promise<Response>};
}):FamilySharedStampRegistryConfig|null{
  const baseUrl=env.SHARED_STAMPS_SERVICE_URL?.trim()??'';
  const token=env.SHARED_STAMPS_SERVICE_TOKEN?.trim()??'';
  if(!baseUrl&&!token)return null;
  if(!baseUrl||!token)throw new TypeError('shared stamp service configuration is incomplete');
  const service=env.SHARED_STAMPS_SERVICE;
  const fetchImpl=service
    ? (((input:any,init?:RequestInit)=>service.fetch(new Request(input,init))) as typeof fetch)
    : undefined;
  return fetchImpl?{baseUrl,token,fetchImpl}:{baseUrl,token};
}

export function createFamilySharedStampRegistryClient(config:FamilySharedStampRegistryConfig,fetchImpl:typeof fetch=config.fetchImpl??fetch){
  const baseUrl=normalizeBaseUrl(config.baseUrl);
  const token=config.token.trim();
  if(!token)throw new TypeError('shared stamp service token is required');
  const write=async(path:string,init:RequestInit)=>{
    const headers=new Headers(init.headers);headers.set('authorization',`Bearer ${token}`);
    return parseJson(await fetchImpl(`${baseUrl}${path}`,{...init,headers}));
  };
  return {
    baseUrl,
    async list():Promise<FamilySharedStampCatalogItem[]>{
      const body=await parseJson(await fetchImpl(`${baseUrl}/v1/stamps`,{headers:{accept:'application/json'}}));
      if(!body||typeof body!=='object'||!Array.isArray((body as {stamps?:unknown}).stamps))throw new TypeError('invalid shared stamp catalog response');
      return (body as {stamps:unknown[]}).stamps.map(parseCatalogItem);
    },
    async get(sharedId:string):Promise<FamilySharedStampCatalogItem|null>{
      if(!SHARED_ID_RE.test(sharedId))throw new TypeError('invalid shared stamp id');
      const response=await fetchImpl(`${baseUrl}/v1/stamps/${encodeURIComponent(sharedId)}`,{headers:{accept:'application/json'}});
      if(response.status===404)return null;
      return parseCatalogItem(await parseJson(response));
    },
    publicUrl(path:string):string{
      if(!PUBLIC_STAMP_PATH_RE.test(path))throw new TypeError('invalid shared stamp content path');
      return `${baseUrl}${path}`;
    },
    create(manifest:FamilySharedStampManifest,parts:{content?:File;thumbnail?:File;frames?:File[]}){
      return write('/v1/stamps',{method:'POST',body:multipart(manifest,parts)});
    },
    addVersion(sharedId:string,manifest:FamilySharedStampManifest,parts:{content?:File;thumbnail?:File;frames?:File[]}){
      if(!SHARED_ID_RE.test(sharedId)||manifest.sharedId!==sharedId)throw new TypeError('shared stamp id mismatch');
      return write(`/v1/stamps/${encodeURIComponent(sharedId)}/versions`,{method:'POST',body:multipart(manifest,parts)});
    },
    update(sharedId:string,patch:{name?:string;enabled?:boolean}){
      if(!SHARED_ID_RE.test(sharedId))throw new TypeError('invalid shared stamp id');
      return write(`/v1/stamps/${encodeURIComponent(sharedId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
    },
  };
}