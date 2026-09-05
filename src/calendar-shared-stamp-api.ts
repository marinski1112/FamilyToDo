import {
  createFamilySharedStampRegistryClient,
  familySharedStampRegistryConfigFromEnv,
} from './calendar-shared-stamp-registry';
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

/**
 * FamilyToDo-local authenticated projection of the reusable shared stamp catalog.
 * The shared registry credential stays server-side; browser DTOs contain only
 * validated service public paths and the public shared-service base URL.
 */
export async function calendarSharedStampCatalogAdminApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,error:'GET_ONLY'},405);
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

  try{
    const stamps=await client.list();
    return json({ok:true,serviceUrl:client.baseUrl,stamps},200,{'cache-control':'private, no-store'});
  }catch{
    return json({ok:false,error:'SHARED_STAMPS_UPSTREAM_FAILED'},502);
  }
}
