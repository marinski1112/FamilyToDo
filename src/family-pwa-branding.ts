import type {AppContext} from './app-context';
import {logActivity} from './activity-log';
import {json} from './response';

type BrandingRow={pwa_display_name:string|null;pwa_icon_updated_at:string|null};
type IconSize=180|192|512;

const DEFAULT_NAME='Family TODO LINE';
const DEFAULT_SHORT_NAME='Family TODO';
const ICON_SIZES:[IconSize,IconSize,IconSize]=[180,192,512];
const MAX_ICON_BYTES=4*1024*1024;
const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] as const;

function familyId(context:AppContext):number|null{
  const id=Number(context.member?.family_id||0);
  return Number.isSafeInteger(id)&&id>0?id:null;
}

function isAdmin(context:AppContext):boolean{
  const role=String(context.member?.role||'').toUpperCase();
  return role==='OWNER'||role==='ADMIN';
}

function iconSize(value:string|null):IconSize|null{
  const n=Number(value||0);
  return ICON_SIZES.includes(n as IconSize)?n as IconSize:null;
}

function iconKey(family:number,size:IconSize):string{
  return `pwa/families/${family}/icon-${size}.png`;
}

function staticIconPath(size:IconSize):string{
  return size===180?'/assets/apple-touch-icon.png':size===192?'/assets/pwa-192.png':'/assets/pwa-512.png';
}

async function brandingRow(context:AppContext,family:number):Promise<BrandingRow|null>{
  return await context.env.DB.prepare('SELECT pwa_display_name,pwa_icon_updated_at FROM families WHERE id=? LIMIT 1').bind(family).first<BrandingRow>()||null;
}

function normalizedDisplayName(value:unknown):{ok:true;value:string|null}|{ok:false}{
  const name=String(value??'').trim();
  if(!name)return {ok:true,value:null};
  const chars=Array.from(name);
  if(chars.length>24||/[\u0000-\u001f\u007f]/u.test(name))return {ok:false};
  return {ok:true,value:name};
}

function csrfBody(context:AppContext,value:unknown):boolean{
  const expected=String(context.session?.csrfToken||'');
  return Boolean(expected&&typeof value==='string'&&value===expected);
}

function csrfHeader(request:Request,context:AppContext):boolean{
  const expected=String(context.session?.csrfToken||'');
  const actual=String(request.headers.get('x-csrf-token')||'');
  return Boolean(expected&&actual&&actual===expected);
}

async function readBoundedBody(request:Request,maxBytes:number):Promise<ArrayBuffer|null>{
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes)return null;
  if(!request.body)return new ArrayBuffer(0);
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel().catch(()=>{});return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const out=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}
  return out.buffer;
}

function pngDimensions(bytes:Uint8Array):{width:number;height:number}|null{
  if(bytes.length<24||!PNG_SIGNATURE.every((value,index)=>bytes[index]===value))return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8,false)!==13)return null;
  if(String.fromCharCode(bytes[12]!,bytes[13]!,bytes[14]!,bytes[15]!)!=='IHDR')return null;
  const width=view.getUint32(16,false),height=view.getUint32(20,false);
  return width>0&&height>0?{width,height}:null;
}

function privateHeaders(contentType:string):Headers{
  return new Headers({
    'content-type':contentType,
    'cache-control':'private, no-store, max-age=0',
    'vary':'Cookie',
    'x-content-type-options':'nosniff',
  });
}

function manifestPayload(displayName:string,customIcon:boolean){
  const shortName=displayName===DEFAULT_NAME?DEFAULT_SHORT_NAME:Array.from(displayName).slice(0,12).join('');
  const icons=customIcon
    ? ICON_SIZES.map(size=>({src:`/app-icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:size===512?'any maskable':'any'}))
    : [
        {src:'/assets/pwa-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
        {src:'/assets/pwa-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'},
      ];
  const shortcutIcon=customIcon?'/app-icon-192.png':'/assets/pwa-192.png';
  return {
    id:'/',
    name:displayName,
    short_name:shortName,
    description:'家族のタスク・イベント、買い物、持ち物、家族ログ、伝言を共有します。',
    lang:'ja',
    start_url:'/app/tasks.php',
    scope:'/',
    display:'standalone',
    background_color:'#f4f6fa',
    theme_color:'#4f46e5',
    icons,
    shortcuts:[
      {name:'タスク・イベント',short_name:'タスク',url:'/app/tasks.php',icons:[{src:shortcutIcon,sizes:'192x192'}]},
      {name:'家族ログ',short_name:'家族ログ',url:'/app/family_log.php',icons:[{src:shortcutIcon,sizes:'192x192'}]},
    ],
  };
}

/** Family-aware manifest. Anonymous requests retain the existing static branding. */
export async function familyPwaManifest(_request:Request,context:AppContext):Promise<Response>{
  const family=familyId(context);
  let displayName=DEFAULT_NAME,customIcon=false;
  if(family){
    const row=await brandingRow(context,family);
    displayName=String(row?.pwa_display_name||'').trim()||DEFAULT_NAME;
    customIcon=Boolean(row?.pwa_icon_updated_at);
  }
  return new Response(JSON.stringify(manifestPayload(displayName,customIcon)),{status:200,headers:privateHeaders('application/manifest+json; charset=utf-8')});
}

/** Family-aware icon proxy. R2 keys are derived only from the authenticated family, never request input. */
export async function familyPwaIcon(request:Request,context:AppContext,size:IconSize):Promise<Response>{
  if(request.method!=='GET'&&request.method!=='HEAD')return json({ok:false,error:'GET only'},405);
  const family=familyId(context);
  if(family){
    const row=await brandingRow(context,family);
    if(row?.pwa_icon_updated_at){
      try{
        const object=await context.env.MEDIA.get(iconKey(family,size));
        if(object){
          const headers=privateHeaders('image/png');
          return new Response(request.method==='HEAD'?null:object.body,{status:200,headers});
        }
      }catch{/* fall through to the safe default icon */}
    }
  }
  const fallback=new URL(staticIconPath(size),request.url);
  const response=await context.env.ASSETS.fetch(new Request(fallback,{method:request.method,headers:request.headers}));
  const headers=new Headers(response.headers);
  headers.set('cache-control','private, no-store, max-age=0');
  headers.set('vary','Cookie');
  headers.set('x-content-type-options','nosniff');
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
}

/** Authenticated family branding metadata/name mutation. */
export async function familyPwaBrandingApi(request:Request,context:AppContext):Promise<Response>{
  const family=familyId(context);
  if(!family)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method==='GET'){
    const row=await brandingRow(context,family);
    return json({ok:true,display_name:String(row?.pwa_display_name||''),icon_configured:Boolean(row?.pwa_icon_updated_at)});
  }
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  if(!isAdmin(context))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  let body:Record<string,unknown>;
  try{body=await request.json() as Record<string,unknown>;}catch{return json({ok:false,error:'INVALID_JSON'},400);}
  if(!csrfBody(context,body.csrf))return json({ok:false,error:'CSRF_FAILED'},403);
  const normalized=normalizedDisplayName(body.display_name);
  if(!normalized.ok)return json({ok:false,error:'表示名は24文字以内で入力してください。',code:'INVALID_DISPLAY_NAME'},400);
  await context.env.DB.prepare("UPDATE families SET pwa_display_name=?,updated_at=datetime('now') WHERE id=?").bind(normalized.value,family).run();
  await logActivity(context,'UPDATED','family',family,{setting:'pwa_display_name'});
  return json({ok:true,display_name:normalized.value||''});
}

/** Admin-only family icon upload/reset. Final PNG dimensions are verified server-side. */
export async function familyPwaIconApi(request:Request,context:AppContext):Promise<Response>{
  const family=familyId(context);
  if(!family)return json({ok:false,error:'AUTH_REQUIRED'},401);
  if(!isAdmin(context))return json({ok:false,error:'ADMIN_REQUIRED'},403);
  if(!csrfHeader(request,context))return json({ok:false,error:'CSRF_FAILED'},403);

  if(request.method==='DELETE'){
    await context.env.DB.prepare("UPDATE families SET pwa_icon_updated_at=NULL,updated_at=datetime('now') WHERE id=?").bind(family).run();
    await context.env.MEDIA.delete(ICON_SIZES.map(size=>iconKey(family,size))).catch(()=>{});
    await logActivity(context,'UPDATED','family',family,{setting:'pwa_icon_reset'});
    return json({ok:true});
  }
  if(request.method!=='POST')return json({ok:false,error:'POST or DELETE only'},405);
  const size=iconSize(new URL(request.url).searchParams.get('size'));
  if(!size)return json({ok:false,error:'INVALID_ICON_SIZE'},400);
  const contentType=String(request.headers.get('content-type')||'').split(';',1)[0]!.trim().toLowerCase();
  if(contentType!=='image/png')return json({ok:false,error:'PNG_REQUIRED'},415);
  const buffer=await readBoundedBody(request,MAX_ICON_BYTES);
  if(!buffer)return json({ok:false,error:'FILE_TOO_LARGE'},413);
  const bytes=new Uint8Array(buffer),dimensions=pngDimensions(bytes);
  if(!dimensions||dimensions.width!==size||dimensions.height!==size)return json({ok:false,error:`${size}x${size}のPNGが必要です。`,code:'INVALID_ICON_DIMENSIONS'},400);

  // Hide the previous custom set while variants are being replaced, preventing mixed cached branding.
  await context.env.DB.prepare('UPDATE families SET pwa_icon_updated_at=NULL WHERE id=?').bind(family).run();
  try{await context.env.MEDIA.put(iconKey(family,size),buffer,{httpMetadata:{contentType:'image/png'}});}
  catch{return json({ok:false,error:'ICON_UPLOAD_FAILED'},500);}

  let complete=false;
  if(size===512){
    const [icon180,icon192]=await Promise.all([
      context.env.MEDIA.get(iconKey(family,180)).catch(()=>null),
      context.env.MEDIA.get(iconKey(family,192)).catch(()=>null),
    ]);
    complete=Boolean(icon180&&icon192);
    if(!complete)return json({ok:false,error:'ICON_SET_INCOMPLETE'},409);
    await context.env.DB.prepare("UPDATE families SET pwa_icon_updated_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(family).run();
    await logActivity(context,'UPDATED','family',family,{setting:'pwa_icon'});
  }
  return json({ok:true,size,complete});
}

export const FAMILY_PWA_BRANDING_LIMITS={maxIconBytes:MAX_ICON_BYTES,displayNameChars:24,iconSizes:ICON_SIZES} as const;
