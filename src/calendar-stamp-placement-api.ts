import {calendarStampAssetsForPicker,createCalendarStampPlacement} from './calendar-stamp-actions';
import {calendarStampAssetUrl} from './calendar-stamp-asset-url';
import {bodyJson,RequestBodyParseError} from './request-body';
import {json} from './response';

function scope(context:any):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

export async function calendarStampOptionsApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  try{
    const assets=await calendarStampAssetsForPicker(context.env,s.familyId,s.memberId);
    const options=assets.flatMap(asset=>{
      const fullUrl=calendarStampAssetUrl(asset,'full'),thumbnailUrl=calendarStampAssetUrl(asset,'thumbnail');
      if(!fullUrl||!thumbnailUrl)return [];
      return [{id:Number(asset.id),name:String(asset.name||''),kind:asset.asset_kind,mimeType:asset.mime_type,thumbnailUrl,fullUrl,width:asset.width,height:asset.height}];
    });
    return json({ok:true,options});
  }catch(error){
    const message=String((error as {message?:unknown})?.message||'');
    if(message.includes('member unavailable'))return json({ok:false,error:'AUTH_REQUIRED'},401);
    return json({ok:false,error:'STAMP_OPTIONS_FAILED'},500);
  }
}

export async function calendarStampPlacementApi(request:Request,context:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);throw error;}
  if(String(body.csrf||'')!==String(context.session?.csrfToken||''))return json({ok:false,error:'CSRF_FAILED'},403);
  const assetId=Number(body.assetId||0),stampDate=String(body.stampDate||''),visibilityScope=body.visibilityScope==null?'FAMILY':String(body.visibilityScope);
  if(!Number.isSafeInteger(assetId)||assetId<=0)return json({ok:false,error:'INVALID_ASSET'},400);
  try{
    const placementId=await createCalendarStampPlacement(context.env,s.familyId,s.memberId,{assetId,stampDate,visibilityScope:visibilityScope as 'FAMILY'|'PRIVATE'});
    return json({ok:true,placementId,stampDate},201);
  }catch(error){
    const message=String((error as {message?:unknown})?.message||'');
    if(message.includes('member unavailable'))return json({ok:false,error:'AUTH_REQUIRED'},401);
    if(message.includes('invalid calendar stamp date')||message.includes('invalid calendar stamp visibility')||message.includes('invalid calendar stamp sort order'))return json({ok:false,error:'INVALID_PLACEMENT'},400);
    if(message.includes('asset unavailable'))return json({ok:false,error:'ASSET_UNAVAILABLE'},404);
    return json({ok:false,error:'STAMP_PLACE_FAILED'},500);
  }
}
