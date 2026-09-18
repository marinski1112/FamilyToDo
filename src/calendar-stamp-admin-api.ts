import { calendarStampAssetUrl } from './calendar-stamp-asset-url';
import { calendarStampAssetsForAdmin } from './calendar-stamp-admin-inventory';
import { setCalendarStampAssetActive } from './calendar-stamp-actions';
import { registerCalendarStampPngSequence } from './calendar-stamp-png-sequence-actions';
import {
  createFamilySharedStampRegistryClient,
  familySharedStampRegistryConfigFromEnv,
} from './calendar-shared-stamp-registry';
import { publishCalendarStampToShared } from './calendar-shared-stamp-publish';
import { cleanupFamilySharedStamp } from './calendar-stamp-global-cleanup';
import { stampDeletionTransport, verifiedStampDeletionState } from './calendar-stamp-deletion-transport';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

function scope(context:any):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

function adminError(error:unknown):Response{
  const message=String((error as {message?:unknown})?.message||'');
  if(message.includes('stamp permanently deleted'))return json({ok:false,error:'STAMP_DELETED'},410);
  if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(message.startsWith('invalid '))return json({ok:false,error:'INVALID_REQUEST'},400);
  return json({ok:false,error:'STAMP_ADMIN_FAILED'},500);
}

async function sharedPublishProjection(context:any,familyId:number,assetIds:number[]):Promise<{
  ready:boolean;
  published:Set<number>;
  failedSource:Set<number>;
}>{
  let configured=false;
  try{
    const config=familySharedStampRegistryConfigFromEnv(context.env);
    if(config){
      createFamilySharedStampRegistryClient(config);
      configured=true;
    }
  }catch{configured=false;}
  if(!assetIds.length)return {ready:false,published:new Set(),failedSource:new Set()};
  try{
    const requested=assetIds.map(()=>'(?)').join(',');
    const rows=await context.env.DB.prepare(`WITH requested(asset_id) AS (VALUES ${requested})
      SELECT requested.asset_id,
        EXISTS(SELECT 1 FROM calendar_shared_stamp_refs ref
          WHERE ref.family_id=? AND ref.asset_id=requested.asset_id) AS published,
        EXISTS(SELECT 1 FROM calendar_stamp_global_sources source
          WHERE source.family_id=? AND source.asset_id=requested.asset_id) AS source_seen
      FROM requested`)
      .bind(...assetIds,familyId,familyId).all();
    const published=new Set<number>();
    const failedSource=new Set<number>();
    for(const row of (rows.results??[]) as Array<{asset_id:number;published:number;source_seen:number}>){
      const assetId=Number(row.asset_id);
      if(!Number.isSafeInteger(assetId)||assetId<=0)continue;
      if(Number(row.published)===1)published.add(assetId);
      else if(Number(row.source_seen)===1)failedSource.add(assetId);
    }
    return {ready:configured,published,failedSource};
  }catch{
    // 0054 may not be deployed yet. Existing local stamp management remains usable
    // and publication/local cleanup stay hidden and fail-closed until shared tables exist.
    return {ready:false,published:new Set(),failedSource:new Set()};
  }
}

export async function calendarStampAdminAssetsApi(request:Request,context:any):Promise<Response>{
  const s=scope(context);if(!s)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method==='GET'){
    try{
      const assets=await calendarStampAssetsForAdmin(context.env,s.familyId,s.memberId);
      const shared=await sharedPublishProjection(context,s.familyId,assets.map(asset=>Number(asset.id)));
      return json({ok:true,sharedPublishingReady:shared.ready,assets:assets.map(asset=>{
        const sharedPublished=shared.published.has(Number(asset.id));
        const sharedPublishCandidate=asset.active===1
          &&asset.asset_kind==='ANIMATED'
          &&asset.mime_type==='image/png'
          &&asset.storage_provider==='UPLOAD';
        return {
          id:Number(asset.id),
          name:String(asset.name||''),
          kind:asset.asset_kind,
          mimeType:asset.mime_type,
          active:asset.active===1,
          thumbnailUrl:asset.active===1?calendarStampAssetUrl(asset,'thumbnail'):null,
          width:asset.width==null?null:Number(asset.width),
          height:asset.height==null?null:Number(asset.height),
          sharedPublished,
          sharedPublishCandidate,
          canPublishShared:shared.ready&&!sharedPublished&&sharedPublishCandidate,
          failedSharedCleanupAvailable:shared.failedSource.has(Number(asset.id))&&!sharedPublished
            &&asset.storage_provider==='UPLOAD',
        };
      })},200,{'cache-control':'private, no-store'});
    }catch(error){return adminError(error);}
  }
  if(request.method!=='POST'&&request.method!=='DELETE')return json({ok:false,error:'GET, POST or DELETE only'},405);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return json({ok:false,error:'INVALID_BODY'},400);throw error;}
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF_FAILED'},403);
  const assetId=Number(body.assetId);
  if(!Number.isSafeInteger(assetId)||assetId<=0)return json({ok:false,error:'INVALID_REQUEST'},400);

  if(request.method==='DELETE'){
    if(body.confirm!=='permanent')return json({ok:false,error:'CONFIRM_REQUIRED'},400);
    try{
      const rows=await context.env.DB.prepare(`SELECT source.shared_stamp_id
        FROM calendar_stamp_global_sources source
        JOIN calendar_stamp_assets asset
          ON asset.id=source.asset_id AND asset.family_id=source.family_id
        WHERE source.asset_id=? AND source.family_id=? AND asset.storage_provider='UPLOAD'
          AND NOT EXISTS(SELECT 1 FROM calendar_shared_stamp_refs ref WHERE ref.asset_id=asset.id)
          AND EXISTS(SELECT 1 FROM members actor
            WHERE actor.id=? AND actor.family_id=? AND actor.active=1 AND actor.role IN ('OWNER','ADMIN'))
        ORDER BY source.shared_stamp_id
        LIMIT 2`).bind(assetId,s.familyId,s.memberId,s.familyId).all();
      const sourceIds=((rows.results??[]) as Array<{shared_stamp_id:string}>)
        .map((row:{shared_stamp_id:string})=>String(row.shared_stamp_id||'')).filter(Boolean);
      if(sourceIds.length===0)return json({ok:false,error:'LOCAL_PURGE_NOT_AVAILABLE'},409);
      if(sourceIds.length!==1)return json({ok:false,error:'LOCAL_PURGE_AMBIGUOUS'},409);
      if(!context.env.MEDIA)return json({ok:false,error:'STORAGE_UNAVAILABLE'},503);
      const config=familySharedStampRegistryConfigFromEnv(context.env);
      if(!config)return json({ok:false,error:'SHARED_STAMPS_UNAVAILABLE'},503);
      const remote=stampDeletionTransport({...config,fetcher:config.fetchImpl});
      const sharedId=sourceIds[0]!;
      const result=await cleanupFamilySharedStamp({
        db:context.env.DB,
        bucket:context.env.MEDIA,
        sharedId,
        confirmRegistryDeletion:async id=>{
          const state=verifiedStampDeletionState(await remote(`/v1/stamps/${id}/deletion`),id);
          return state.sharedId===id&&(state.state==='pending'||state.state==='completed');
        },
      });
      return json({ok:true,assetId,deleted:result.complete,cleanupPending:result.cleanupPending},
        result.complete?200:202,{'cache-control':'private, no-store'});
    }catch{
      return json({ok:false,error:'LOCAL_PURGE_RETRY_REQUIRED'},503);
    }
  }

  const active=body.active;
  if(typeof active!=='boolean')return json({ok:false,error:'INVALID_REQUEST'},400);
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
  if(body.storageProvider!=null&&typeof body.storageProvider!=='string')return json({ok:false,error:'INVALID_STORAGE_PROVIDER'},400);
  const rawStorageProvider=String(body.storageProvider??'').trim();
  if(rawStorageProvider&&rawStorageProvider!=='ASSETS'&&rawStorageProvider!=='UPLOAD')return json({ok:false,error:'INVALID_STORAGE_PROVIDER'},400);
  const storageProvider=(rawStorageProvider||'ASSETS') as 'ASSETS'|'UPLOAD';
  try{
    const assetId=await registerCalendarStampPngSequence(context.env,s.familyId,s.memberId,{
      name:String(body.name||''),
      storageProvider,
      frames,
      thumbnailStorageKey:body.thumbnailStorageKey==null?null:String(body.thumbnailStorageKey),
      width:body.width==null?null:Number(body.width),
      height:body.height==null?null:Number(body.height),
    });
    let sharedPublished=false;
    if(storageProvider==='UPLOAD'){
      try{
        const config=familySharedStampRegistryConfigFromEnv(context.env);
        if(config){
          const client=createFamilySharedStampRegistryClient(config);
          await publishCalendarStampToShared(context.env,s.familyId,s.memberId,assetId,client);
          sharedPublished=true;
        }
      }catch{
        // Local registration is durable even when shared infrastructure/config is
        // temporarily unavailable. The inventory exposes a retry action once ready.
        sharedPublished=false;
      }
    }
    return json({ok:true,assetId,sharedPublished},201);
  }catch(error){
    const message=String((error as {message?:unknown})?.message||'');
    if(message.includes('admin required'))return json({ok:false,error:'ADMIN_REQUIRED'},403);
    if(message.startsWith('invalid ')||message.includes('duplicate calendar stamp')||message.includes('must be paired'))return json({ok:false,error:'INVALID_SEQUENCE'},400);
    return json({ok:false,error:'STAMP_SEQUENCE_REGISTER_FAILED'},500);
  }
}