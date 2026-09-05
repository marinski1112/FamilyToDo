import {
  createFamilySharedStampRegistryClient,
  familySharedStampRegistryConfigFromEnv,
} from './calendar-shared-stamp-registry';
import { materializeCalendarSharedStamp } from './calendar-shared-stamp-import';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

function scope(context:any):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

async function activeAdmin(env:Env,familyId:number,memberId:number):Promise<boolean>{
  const row=await env.DB.prepare("SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND role IN ('OWNER','ADMIN') LIMIT 1")
    .bind(memberId,familyId).first<{id:number}>();
  return Boolean(row);
}

function hasQuery(request:Request):boolean{
  return new URL(request.url).search!=='';
}

function importError(error:unknown):Response{
  const message=String((error as {message?:unknown})?.message||'');
  if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(message.includes('projection disabled'))return json({ok:false,error:'SHARED_STAMP_DISABLED'},409);
  if(message.includes('mime unsupported')||message.includes('frame mime unsupported'))return json({ok:false,error:'SHARED_STAMP_UNSUPPORTED'},415);
  if(message.includes('unavailable'))return json({ok:false,error:'SHARED_STAMP_NOT_FOUND'},404);
  if(message.startsWith('invalid '))return json({ok:false,error:'INVALID_REQUEST'},400);
  if(message.includes('upstream')||message.includes('byte size mismatch')||message.includes('bounds invalid')||message.includes('frame budget')||message.includes('frame count')||message.includes('frame dimensions')||message.includes('frames response'))return json({ok:false,error:'SHARED_STAMPS_UPSTREAM_FAILED'},502);
  return json({ok:false,error:'SHARED_STAMP_IMPORT_FAILED'},500);
}

async function localProjectionMap(env:Env,familyId:number):Promise<Map<string,{assetId:number;active:boolean}>>{
  const rows=await env.DB.prepare(`SELECT ref.shared_stamp_id,ref.shared_version,ref.asset_id,asset.active
    FROM calendar_shared_stamp_refs ref
    JOIN calendar_stamp_assets asset ON asset.id=ref.asset_id AND asset.family_id=ref.family_id
    WHERE ref.family_id=?`).bind(familyId).all<{shared_stamp_id:string;shared_version:number;asset_id:number;active:number}>();
  return new Map(rows.results.map(row=>[
    `${row.shared_stamp_id}:${Number(row.shared_version)}`,
    {assetId:Number(row.asset_id),active:Number(row.active)===1},
  ]));
}

/**
 * Admin-only FamilyToDo projection of the reusable shared stamp catalog.
 * GET exposes only validated public shared-service paths plus local mapping state.
 * POST materializes one immutable shared version into the existing private MEDIA
 * transport, then attaches the 0054 mapping. Shared writer credentials never cross
 * the browser boundary.
 */
export async function calendarSharedStampCatalogAdminApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='GET'&&request.method!=='POST')return json({ok:false,error:'GET_OR_POST_ONLY'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(hasQuery(request))return json({ok:false,error:'INVALID_REQUEST'},400);

  try{
    if(!await activeAdmin(context.env,s.familyId,s.memberId))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  }catch{
    return json({ok:false,error:'STAMP_SHARED_CATALOG_FAILED'},500);
  }

  let client:ReturnType<typeof createFamilySharedStampRegistryClient>;
  try{
    const config=familySharedStampRegistryConfigFromEnv(context.env);
    if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);
    client=createFamilySharedStampRegistryClient(config);
  }catch{
    return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);
  }

  if(request.method==='GET'){
    try{
      const [stamps,localRefs]=await Promise.all([client.list(),localProjectionMap(context.env,s.familyId)]);
      const projected=stamps.map(stamp=>{
        const local=localRefs.get(`${stamp.sharedId}:${stamp.currentVersion}`)??null;
        return {...stamp,localAssetId:local?.assetId??null,localActive:local?.active??null};
      });
      return json({ok:true,serviceUrl:client.baseUrl,stamps:projected},200,{'cache-control':'private, no-store'});
    }catch{
      return json({ok:false,error:'SHARED_STAMPS_UPSTREAM_FAILED'},502);
    }
  }

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){
    if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);
    throw error;
  }
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  try{
    const result=await materializeCalendarSharedStamp(
      context.env,
      s.familyId,
      s.memberId,
      client,
      body.sharedStampId,
      body.sharedVersion,
    );
    return json({ok:true,...result},result.reused?200:201,{'cache-control':'private, no-store'});
  }catch(error){
    return importError(error);
  }
}
