import type {AppContext} from './app-context';
import {calendarStampManagedUploadObjectKey} from './calendar-stamp-storage';
import {bodyJson,RequestBodyParseError} from './request-body';
import {json} from './response';

const MAX_BYTES=4*1024*1024;
const PNG=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
const dateOk=(value:string)=>{if(!/^(?:20\d{2}|2100)-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
const idOk=(value:unknown)=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const mediaUrl=(id:number)=>`/api/calendar-sticker-media?asset=${id}`;
function scope(ctx:AppContext){const familyId=Number(ctx.member?.family_id),memberId=Number(ctx.member?.id);return idOk(familyId)&&idOk(memberId)?{familyId,memberId}:null;}
async function active(ctx:AppContext,s:{familyId:number;memberId:number},admin=false){return !!(await ctx.env.DB.prepare(`SELECT 1 FROM members WHERE id=? AND family_id=? AND active=1${admin?" AND role IN ('OWNER','ADMIN')":''}`).bind(s.memberId,s.familyId).first());}
function csrfOk(request:Request,ctx:AppContext,body?:Record<string,unknown>){const provided=String(body?.csrf||request.headers.get('x-csrf-token')||'');return !!provided&&provided===String(ctx.session?.csrfToken||'');}

export async function calendarStickerAdminApi(request:Request,ctx:AppContext):Promise<Response>{
  const s=scope(ctx);if(!s||!(await active(ctx,s)))return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(!(await active(ctx,s,true)))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(request.method==='GET'){
    const rows=await ctx.env.DB.prepare('SELECT id,name,active FROM calendar_sticker_assets WHERE family_id=? ORDER BY id DESC LIMIT 100').bind(s.familyId).all<{id:number;name:string;active:number}>();
    return json({ok:true,assets:rows.results.map(row=>({id:row.id,name:row.name,active:row.active===1,url:mediaUrl(row.id)}))},200,{'cache-control':'private, no-store'});
  }
  if(!csrfOk(request,ctx))return json({ok:false,error:'CSRF_FAILED'},403);
  if(request.method==='PATCH'){
    let body:Record<string,unknown>;try{body=await bodyJson(request);}catch{return json({ok:false,error:'INVALID_BODY'},400);}
    if(!idOk(body.assetId)||typeof body.active!=='boolean')return json({ok:false,error:'INVALID_REQUEST'},400);
    const result=await ctx.env.DB.prepare('UPDATE calendar_sticker_assets SET active=? WHERE id=? AND family_id=?').bind(body.active?1:0,Number(body.assetId),s.familyId).run();
    return result.meta.changes?json({ok:true}):json({ok:false,error:'NOT_FOUND'},404);
  }
  if(request.method!=='POST')return json({ok:false,error:'GET, POST or PATCH only'},405);
  let name='';try{name=decodeURIComponent(String(request.headers.get('x-sticker-name')||'')).trim();}catch{return json({ok:false,error:'INVALID_NAME'},400);}
  if(!name||name.length>80)return json({ok:false,error:'INVALID_NAME'},400);
  if(request.headers.get('content-type')?.split(';',1)[0]?.toLowerCase()!=='image/png')return json({ok:false,error:'PNG_REQUIRED'},415);
  if(Number(request.headers.get('content-length')||0)>MAX_BYTES)return json({ok:false,error:'FILE_TOO_LARGE'},413);
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.length<24||bytes.length>MAX_BYTES||!PNG.every((v,i)=>bytes[i]===v))return json({ok:false,error:'INVALID_PNG'},400);
  const width=new DataView(bytes.buffer).getUint32(16),height=new DataView(bytes.buffer).getUint32(20);
  if(!width||!height||width>4096||height>4096)return json({ok:false,error:'INVALID_DIMENSIONS'},400);
  const key=`stickers/${crypto.randomUUID()}.png`,objectKey=calendarStampManagedUploadObjectKey(s.familyId,key);
  try{
    await ctx.env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:'image/png'}});
    const result=await ctx.env.DB.prepare('INSERT INTO calendar_sticker_assets(family_id,name,storage_key,created_by,created_at) VALUES(?,?,?,?,?)').bind(s.familyId,name,key,s.memberId,new Date().toISOString()).run();
    return json({ok:true,id:Number(result.meta.last_row_id)},201);
  }catch{
    await ctx.env.MEDIA.delete(objectKey).catch(()=>{});
    return json({ok:false,error:'STICKER_UPLOAD_FAILED'},500);
  }
}

export async function calendarStickerMediaApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);
  const s=scope(ctx);if(!s||!(await active(ctx,s)))return json({ok:false,error:'AUTH_REQUIRED'},401);
  const id=new URL(request.url).searchParams.get('asset');if(!idOk(id))return json({ok:false,error:'INVALID_ASSET'},400);
  const row=await ctx.env.DB.prepare('SELECT storage_key FROM calendar_sticker_assets WHERE id=? AND family_id=? AND active=1').bind(Number(id),s.familyId).first<{storage_key:string}>();
  if(!row)return json({ok:false,error:'NOT_FOUND'},404);
  const object=await ctx.env.MEDIA.get(calendarStampManagedUploadObjectKey(s.familyId,row.storage_key));
  if(!object)return json({ok:false,error:'NOT_FOUND'},404);
  return new Response(object.body,{headers:{'content-type':'image/png','cache-control':'private, max-age=0, must-revalidate','x-content-type-options':'nosniff'}});
}

export async function calendarStickerDaysApi(request:Request,ctx:AppContext):Promise<Response>{
  const s=scope(ctx);if(!s||!(await active(ctx,s)))return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method==='GET'){
    const url=new URL(request.url),from=String(url.searchParams.get('from')||''),to=String(url.searchParams.get('to')||'');
    if(!dateOk(from)||!dateOk(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>62)return json({ok:false,error:'INVALID_RANGE'},400);
    const [options,days]=await Promise.all([
      ctx.env.DB.prepare('SELECT id,name FROM calendar_sticker_assets WHERE family_id=? AND active=1 ORDER BY id DESC LIMIT 100').bind(s.familyId).all<{id:number;name:string}>(),
      ctx.env.DB.prepare(`SELECT d.id,d.sticker_date,d.owner_id,d.created_by,a.id asset_id,a.name
        FROM calendar_sticker_days d JOIN calendar_sticker_assets a ON a.id=d.asset_id AND a.family_id=d.family_id AND a.active=1
        WHERE d.family_id=? AND d.sticker_date BETWEEN ? AND ? AND d.owner_id IN (0,?)
        ORDER BY d.sticker_date,d.owner_id`).bind(s.familyId,from,to,s.memberId).all<{id:number;sticker_date:string;owner_id:number;created_by:number;asset_id:number;name:string}>(),
    ]);
    return json({ok:true,options:options.results.map(row=>({id:row.id,name:row.name,url:mediaUrl(row.id)})),days:days.results.map(row=>({id:row.id,date:row.sticker_date,scope:row.owner_id?'PRIVATE':'FAMILY',assetId:row.asset_id,name:row.name,url:mediaUrl(row.asset_id),canRemove:row.created_by===s.memberId||String(ctx.member?.role||'').toUpperCase()==='OWNER'||String(ctx.member?.role||'').toUpperCase()==='ADMIN'}))},200,{'cache-control':'private, no-store'});
  }
  if(request.method!=='POST'&&request.method!=='DELETE')return json({ok:false,error:'GET, POST or DELETE only'},405);
  let body:Record<string,unknown>;try{body=await bodyJson(request);}catch(error){return json({ok:false,error:error instanceof RequestBodyParseError?'INVALID_BODY':'INVALID_REQUEST'},400);}
  if(!csrfOk(request,ctx,body))return json({ok:false,error:'CSRF_FAILED'},403);
  const date=String(body.date||''),visibility=String(body.visibilityScope||'FAMILY');
  if(!dateOk(date)||!['FAMILY','PRIVATE'].includes(visibility))return json({ok:false,error:'INVALID_DATE_OR_SCOPE'},400);
  const owner=visibility==='PRIVATE'?s.memberId:0;
  if(request.method==='DELETE'){
    const result=await ctx.env.DB.prepare(`DELETE FROM calendar_sticker_days WHERE family_id=? AND sticker_date=? AND owner_id=? AND (created_by=? OR EXISTS(SELECT 1 FROM members WHERE id=? AND family_id=? AND role IN ('OWNER','ADMIN')))`)
      .bind(s.familyId,date,owner,s.memberId,s.memberId,s.familyId).run();
    return result.meta.changes?json({ok:true}):json({ok:false,error:'NOT_FOUND'},404);
  }
  if(!idOk(body.assetId))return json({ok:false,error:'INVALID_ASSET'},400);
  const asset=await ctx.env.DB.prepare('SELECT id FROM calendar_sticker_assets WHERE id=? AND family_id=? AND active=1').bind(Number(body.assetId),s.familyId).first();
  if(!asset)return json({ok:false,error:'ASSET_UNAVAILABLE'},404);
  const existing=await ctx.env.DB.prepare('SELECT created_by FROM calendar_sticker_days WHERE family_id=? AND sticker_date=? AND owner_id=?').bind(s.familyId,date,owner).first<{created_by:number}>();
  if(existing&&existing.created_by!==s.memberId&&!(await active(ctx,s,true)))return json({ok:false,error:'OWNER_REQUIRED'},403);
  await ctx.env.DB.prepare(`INSERT INTO calendar_sticker_days(family_id,asset_id,sticker_date,owner_id,created_by,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(family_id,sticker_date,owner_id) DO UPDATE SET asset_id=excluded.asset_id,created_by=excluded.created_by,updated_at=excluded.updated_at`)
    .bind(s.familyId,Number(body.assetId),date,owner,s.memberId,new Date().toISOString()).run();
  return json({ok:true},200);
}
