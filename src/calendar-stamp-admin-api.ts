import { calendarStampAssetUrl } from './calendar-stamp-asset-url';
import { calendarStampAssetsForAdmin } from './calendar-stamp-admin-inventory';
import { setCalendarStampAssetActive } from './calendar-stamp-actions';
import { registerCalendarStampPngSequence } from './calendar-stamp-png-sequence-actions';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

function scope(context:any):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

function adminError(error:unknown):Response{
  const message=String((error as {message?:unknown})?.message||'');
  if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(message.startsWith('invalid '))return json({ok:false,error:'INVALID_REQUEST'},400);
  return json({ok:false,error:'STAMP_ADMIN_FAILED'},500);
}

export async function calendarStampAdminAssetsApi(request:Request,context:any):Promise<Response>{
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method==='GET'){
    try{
      const assets=await calendarStampAssetsForAdmin(context.env,s.familyId,s.memberId);
      return json({ok:true,assets:assets.map(asset=>({
        id:Number(asset.id),
        name:String(asset.name||''),
        kind:asset.asset_kind,
        mimeType:asset.mime_type,
        active:asset.active===1,
        thumbnailUrl:asset.active===1?calendarStampAssetUrl(asset,'thumbnail'):null,
        width:asset.width==null?null:Number(asset.width),
        height:asset.height==null?null:Number(asset.height),
      }))},200,{'cache-control':'private, no-store'});
    }catch(error){return adminError(error);}
  }
  if(request.method!=='POST')return json({ok:false,error:'GET or POST only'},405);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);throw error;}
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  const assetId=Number(body.assetId),active=body.active;
  if(!Number.isSafeInteger(assetId)||assetId<=0||typeof active!=='boolean')return json({ok:false,error:'INVALID_REQUEST'},400);
  try{
    const changed=await setCalendarStampAssetActive(context.env,s.familyId,s.memberId,assetId,active);
    return changed?json({ok:true,assetId,active}):json({ok:false,error:'ASSET_NOT_FOUND'},404);
  }catch(error){return adminError(error);}
}

export async function calendarStampPngSequenceAdminApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);throw error;}
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  const rawFrames=Array.isArray(body.frames)?body.frames:[];
  const frames=rawFrames.map((frame:any)=>({storageKey:String(frame?.storageKey||''),durationMs:frame?.durationMs==null?undefined:Number(frame.durationMs)}));
  const storageProvider=body.storageProvider==='UPLOAD'?'UPLOAD':'ASSETS';
  try{
    const assetId=await registerCalendarStampPngSequence(context.env,s.familyId,s.memberId,{
      name:String(body.name||''),
      storageProvider,
      frames,
      thumbnailStorageKey:body.thumbnailStorageKey==null?null:String(body.thumbnailStorageKey),
      width:body.width==null?null:Number(body.width),
      height:body.height==null?null:Number(body.height),
    });
    return json({ok:true,assetId},201);
  }catch(error){
    const message=String((error as {message?:unknown})?.message||'');
    if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
    if(message.startsWith('invalid ')||message.includes('duplicate calendar stamp')||message.includes('must be paired'))return json({ok:false,error:'INVALID_SEQUENCE'},400);
    return json({ok:false,error:'STAMP_SEQUENCE_REGISTER_FAILED'},500);
  }
}
