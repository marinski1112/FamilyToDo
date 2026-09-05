import {
  createFamilySharedStampRegistryClient,
  familySharedStampRegistryConfigFromEnv,
} from './calendar-shared-stamp-registry';
import {
  CalendarSharedStampPublishIncompatibleError,
  CalendarSharedStampPublishUpstreamError,
  publishCalendarStampToShared,
} from './calendar-shared-stamp-publish';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

function scope(context:any):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

function failure(error:unknown):Response{
  if(error instanceof CalendarSharedStampPublishIncompatibleError)return json({ok:false,error:'SHARED_STAMP_INCOMPATIBLE'},422);
  if(error instanceof CalendarSharedStampPublishUpstreamError)return json({ok:false,error:'SHARED_STAMPS_UPSTREAM_FAILED'},502);
  const message=String((error as {message?:unknown})?.message||'');
  if(message.includes('shared stamp service configuration')||message.includes('shared stamp service token'))return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);
  if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(message.includes('asset unavailable'))return json({ok:false,error:'ASSET_NOT_FOUND'},404);
  if(message.startsWith('invalid '))return json({ok:false,error:'INVALID_REQUEST'},400);
  return json({ok:false,error:'SHARED_STAMP_PUBLISH_FAILED'},500);
}

/**
 * OWNER/ADMIN + CSRF browser boundary for explicit FamilyToDo -> shared registry
 * publication. Registry credentials are consumed only by the Worker-side client.
 */
export async function calendarSharedStampPublishAdminApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST_ONLY'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(new URL(request.url).search)return json({ok:false,error:'INVALID_REQUEST'},400);

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){
    if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);
    throw error;
  }
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  const assetId=Number(body.assetId);
  if(!Number.isSafeInteger(assetId)||assetId<=0)return json({ok:false,error:'INVALID_REQUEST'},400);

  try{
    const config=familySharedStampRegistryConfigFromEnv(context.env);
    if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);
    const client=createFamilySharedStampRegistryClient(config);
    const published=await publishCalendarStampToShared(context.env,s.familyId,s.memberId,assetId,client);
    return json({
      ok:true,
      assetId:published.assetId,
      sharedPublished:true,
      reused:published.reused,
    },published.reused?200:201,{'cache-control':'private, no-store'});
  }catch(error){return failure(error);}
}