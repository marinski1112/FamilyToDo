import {calendarStampAssetsForPicker,createCalendarStampPlacement,deleteCalendarStampPlacement,updateCalendarStampPlacement} from './calendar-stamp-actions';
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
  if(request.method!=='POST'&&request.method!=='DELETE'){
    if(request.method!=='PATCH')return json({ok:false,error:'POST, PATCH or DELETE only'},405);
  }
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);throw error;}
  const csrf=String(body.csrf||''),expectedCsrf=String(context.session?.csrfToken||'');
  if(!csrf||!expectedCsrf||csrf!==expectedCsrf)return json({ok:false,error:'CSRF_FAILED'},403);
  if(request.method==='DELETE'){
    const placementId=Number(body.placementId||0);
    if(!Number.isSafeInteger(placementId)||placementId<=0)return json({ok:false,error:'INVALID_PLACEMENT'},400);
    try{
      const deleted=await deleteCalendarStampPlacement(context.env,s.familyId,s.memberId,placementId);
      return deleted?json({ok:true,placementId}):json({ok:false,error:'PLACEMENT_NOT_FOUND'},404);
    }catch(error){
      const message=String((error as {message?:unknown})?.message||'');
      if(message.includes('member unavailable'))return json({ok:false,error:'AUTH_REQUIRED'},401);
      if(message.includes('invalid calendar stamp placement'))return json({ok:false,error:'INVALID_PLACEMENT'},400);
      return json({ok:false,error:'STAMP_DELETE_FAILED'},500);
    }
  }
  if(request.method==='POST'&&body.action==='reorder'){
    const placementId=Number(body.placementId||0),beforeId=Number(body.beforePlacementId||0);
    const stampDate=String(body.stampDate||'');
    if(!Number.isSafeInteger(placementId)||placementId<=0||!Number.isSafeInteger(beforeId)||beforeId<0||
      !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(stampDate)||
      new Date(`${stampDate}T00:00:00Z`).toISOString().slice(0,10)!==stampDate)
      return json({ok:false,error:'INVALID_PLACEMENT'},400);
    const read=await context.env.DB.prepare(`SELECT p.id,p.sort_order,p.created_by FROM calendar_stamp_placements p
      JOIN calendar_stamp_assets a ON a.id=p.asset_id AND a.family_id=p.family_id AND a.active=1
      WHERE p.family_id=? AND p.stamp_date=? AND
        (p.visibility_scope='FAMILY' OR (p.visibility_scope='PRIVATE' AND p.private_owner_id=?))
      ORDER BY p.sort_order,p.id LIMIT 257`).bind(s.familyId,stampDate,s.memberId).all();
    const rows=read.results as {id:number;sort_order:number;created_by:number}[];
    if(rows.length>256)return json({ok:false,error:'TOO_MANY_PLACEMENTS'},409);
    const source=rows.find(row=>Number(row.id)===placementId);
    if(!source||Number(source.created_by)!==s.memberId)return json({ok:false,error:'PLACEMENT_NOT_FOUND'},404);
    const ordered=rows.filter(row=>Number(row.id)!==placementId);
    const index=beforeId===0?ordered.length:ordered.findIndex(row=>Number(row.id)===beforeId);
    if(index<0)return json({ok:false,error:'TARGET_NOT_FOUND'},404);
    ordered.splice(index,0,source);
    if(ordered.every((row,position)=>row.id===rows[position]?.id))return json({ok:true,placementId,stampDate});
    const now=new Date().toISOString().replace('T',' ').slice(0,19);
    const changes=ordered.flatMap((row,position)=>{
      const next=position-ordered.length;
      return Number(row.sort_order)===next?[]:[context.env.DB.prepare(`UPDATE calendar_stamp_placements
        SET sort_order=?,updated_at=? WHERE id=? AND family_id=? AND stamp_date=? AND sort_order=?
          AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?))`)
        .bind(next,now,row.id,s.familyId,stampDate,row.sort_order,s.memberId)];
    });
    if(changes.length)await context.env.DB.batch(changes);
    return json({ok:true,placementId,stampDate});
  }
  if(request.method==='PATCH'||(request.method==='POST'&&body.action==='move')){
    if(body.visibilityScope==null||body.sortOrder==null)return json({ok:false,error:'INVALID_PLACEMENT'},400);
    const placementId=Number(body.placementId||0),stampDate=String(body.stampDate||''),visibilityScope=String(body.visibilityScope),sortOrder=Number(body.sortOrder);
    if(!Number.isSafeInteger(placementId)||placementId<=0||!Number.isSafeInteger(sortOrder))return json({ok:false,error:'INVALID_PLACEMENT'},400);
    try{
      const updated=await updateCalendarStampPlacement(context.env,s.familyId,s.memberId,placementId,{stampDate,visibilityScope:visibilityScope as 'FAMILY'|'PRIVATE',sortOrder});
      return updated?json({ok:true,placementId,stampDate,visibilityScope,sortOrder}):json({ok:false,error:'PLACEMENT_NOT_FOUND'},404);
    }catch(error){
      const message=String((error as {message?:unknown})?.message||'');
      if(message.includes('member unavailable'))return json({ok:false,error:'AUTH_REQUIRED'},401);
      if(message.includes('invalid calendar stamp placement')||message.includes('invalid calendar stamp date')||message.includes('invalid calendar stamp visibility')||message.includes('invalid calendar stamp sort order'))return json({ok:false,error:'INVALID_PLACEMENT'},400);
      return json({ok:false,error:'STAMP_UPDATE_FAILED'},500);
    }
  }
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
