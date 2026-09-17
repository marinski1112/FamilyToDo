import type {AppContext} from './app-context';
import {memberById} from './app-context';
import {familyLogMediaApi} from './family-log-media-api';
import {messagePhotoApi} from './message-photo-api';
import {createPhotoTransfer,claimPhotoTransfer,consumePhotoTransfer,consumePhotoTransferRecovery,consumePhotoTransferWithRecovery,inspectPhotoTransfer,inspectPhotoTransferRecovery,photoSha256,type PhotoTransfer} from './photo-transfer-service';
const MAX_BYTES=4*1024*1024;
const TOKEN_PATTERN=/^[a-f0-9]{64}$/u;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer'}});
export async function readTransferBody(request:Request|Response,limit:number):Promise<Uint8Array> {
 if(Number(request.headers.get('content-length'))>limit)throw Error('BODY_LIMIT');
 const reader=request.body?.getReader();if(!reader)throw Error('EMPTY_BODY');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('BODY_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function sourcePhoto(ctx:AppContext,kind:string,id:number):Promise<Response> {
 if(kind==='message')return messagePhotoApi(new Request(`https://internal/api/messages?photo=${id}`),ctx);
 const meta=await familyLogMediaApi(new Request(`https://internal/api/family-log-media?log=${id}`),ctx);
 if(!meta.ok)return meta;
 const data=await meta.json() as {media?:{id?:number}};
 if(!Number.isSafeInteger(data.media?.id))return reply({ok:false},404);
 return familyLogMediaApi(new Request(`https://internal/api/family-log-media?media=${data.media!.id}`),ctx);
}
async function parseTransferToken(request:Request):Promise<string|null> {
 const {token}=JSON.parse(new TextDecoder().decode(await readTransferBody(request,128)));
 return typeof token==='string'&&TOKEN_PATTERN.test(token)?token:null;
}
type ConsumeCapability={kind:'token';token:string;recoveryHash?:string}|{kind:'recovery';recoveryToken:string};
async function parseConsumeCapability(request:Request):Promise<ConsumeCapability|null> {
 const body=JSON.parse(new TextDecoder().decode(await readTransferBody(request,256))) as Record<string,unknown>;
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const keys=Object.keys(body);
 if(keys.length===1&&keys[0]==='recoveryToken'){
  return typeof body.recoveryToken==='string'&&TOKEN_PATTERN.test(body.recoveryToken)?{kind:'recovery',recoveryToken:body.recoveryToken}:null;
 }
 if(!keys.includes('token')||keys.some((key)=>!['token','recoveryHash'].includes(key)))return null;
 if(typeof body.token!=='string'||!TOKEN_PATTERN.test(body.token))return null;
 if(body.recoveryHash===undefined)return {kind:'token',token:body.token};
 if(typeof body.recoveryHash!=='string'||!TOKEN_PATTERN.test(body.recoveryHash))return null;
 return {kind:'token',token:body.token,recoveryHash:body.recoveryHash};
}
function epochSeconds(value:string|null):number|null {
 const raw=String(value||'').trim();if(!raw)return null;
 let iso=raw;
 if(/^\d{4}-\d{2}-\d{2}$/u.test(raw))iso=`${raw}T00:00:00+09:00`;
 else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/u.test(raw))iso=`${raw.replace(' ','T')}${raw.length===16?':00':''}+09:00`;
 const ms=Date.parse(iso);if(!Number.isFinite(ms)||ms<=0)return null;
 return Math.floor(ms/1000);
}
function capturedHeader(value:string|null):number|null {const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
function exifCapturedAt(bytes:Uint8Array,mime:string):number|null {
 if(mime!=='image/jpeg'||bytes.length<14||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
 const read16=(offset:number,little:boolean)=>offset+2<=bytes.length?(little?bytes[offset]!|(bytes[offset+1]!<<8):(bytes[offset]!<<8)|bytes[offset+1]!):NaN;
 const read32=(offset:number,little:boolean)=>{
  if(offset+4>bytes.length)return NaN;
  if(little)return (bytes[offset]!|(bytes[offset+1]!<<8)|(bytes[offset+2]!<<16)|(bytes[offset+3]!<<24))>>>0;
  return ((bytes[offset]!<<24)|(bytes[offset+1]!<<16)|(bytes[offset+2]!<<8)|bytes[offset+3]!)>>>0;
 };
 for(let marker=2;marker+4<=bytes.length;){
  if(bytes[marker]!==0xff){marker++;continue;}
  const code=bytes[marker+1]!;if(code===0xd9||code===0xda)break;
  if(code===0x00||code===0x01||(code>=0xd0&&code<=0xd8)){marker+=2;continue;}
  const segmentLength=(bytes[marker+2]!<<8)|bytes[marker+3]!;if(segmentLength<2||marker+2+segmentLength>bytes.length)break;
  const dataStart=marker+4;
  if(code===0xe1&&segmentLength>=14&&String.fromCharCode(...bytes.subarray(dataStart,dataStart+6))==='Exif\0\0'){
   const tiff=dataStart+6,little=bytes[tiff]===0x49&&bytes[tiff+1]===0x49,big=bytes[tiff]===0x4d&&bytes[tiff+1]===0x4d;
   if(!little&&!big)return null;if(read16(tiff+2,little)!==42)return null;
   const readIfd=(relative:number)=>{
    const result=new Map<number,number>(),base=tiff+relative;if(!Number.isSafeInteger(relative)||relative<0||base+2>bytes.length)return result;
    const count=read16(base,little);if(!Number.isSafeInteger(count)||count<0||count>512)return result;
    for(let i=0;i<count;i++){const entry=base+2+i*12;if(entry+12>bytes.length)break;result.set(read16(entry,little),entry);}return result;
   };
   const ascii=(entry:number|undefined)=>{
    if(entry===undefined||read16(entry+2,little)!==2)return '';
    const count=read32(entry+4,little);if(!Number.isSafeInteger(count)||count<1||count>128)return '';
    const start=count<=4?entry+8:tiff+read32(entry+8,little);if(!Number.isSafeInteger(start)||start<0||start+count>bytes.length)return '';
    return String.fromCharCode(...bytes.subarray(start,start+count)).replace(/\0.*$/u,'').trim();
   };
   const ifd0=readIfd(read32(tiff+4,little));
   const exifPointer=ifd0.get(0x8769),exifIfd=exifPointer===undefined?new Map<number,number>():readIfd(read32(exifPointer+8,little));
   const dateText=ascii(exifIfd.get(0x9003))||ascii(exifIfd.get(0x9004))||ascii(ifd0.get(0x0132));
   const match=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(dateText);if(!match)return null;
   const offset=ascii(exifIfd.get(0x9011));const zone=/^[+-]\d{2}:\d{2}$/u.test(offset)?offset:'+09:00';
   return epochSeconds(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${zone}`);
  }
  marker+=2+segmentLength;
 }
 return null;
}
async function parentCapturedAt(env:Env,familyId:number,kind:string,id:number):Promise<number|null> {
 if(kind==='message'){
  const row=await env.DB.prepare('SELECT COALESCE(reminder_at,created_at) AS captured_at FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,familyId).first<{captured_at:string|null}>();
  return epochSeconds(row?.captured_at??null);
 }
 const row=await env.DB.prepare('SELECT occurred_at AS captured_at FROM family_logs WHERE id=? AND family_id=? AND deleted_at IS NULL LIMIT 1').bind(id,familyId).first<{captured_at:string|null}>();
 return epochSeconds(row?.captured_at??null);
}
type ResolvedPhoto={ok:true;mime:string;bytes:Uint8Array;caption:string;capturedAt:number}|{ok:false;response:Response};
async function resolveTransferPhoto(request:Request,env:Env,row:PhotoTransfer):Promise<ResolvedPhoto> {
 const member=await memberById(env,row.member_id);
 if(!member||member.family_id!==row.family_id)return {ok:false,response:reply({ok:false},404)};
 const ctx={request,env,member,session:{}} as AppContext;
 const photo=await sourcePhoto(ctx,row.source_kind,row.source_id);
 if(!photo.ok){await photo.body?.cancel();return {ok:false,response:reply({ok:false},404)};}
 const mime=photo.headers.get('content-type')||'',preservedCapturedAt=capturedHeader(photo.headers.get('x-photo-captured-at'));
 if(!['image/jpeg','image/png','image/webp'].includes(mime)){await photo.body?.cancel();return {ok:false,response:reply({ok:false},404)};}
 const bytes=await readTransferBody(photo,MAX_BYTES);
 if(await photoSha256(bytes)!==row.sha256)return {ok:false,response:reply({ok:false,error:'SOURCE_CHANGED'},409)};
 const capturedAt=preservedCapturedAt??exifCapturedAt(bytes,mime)??await parentCapturedAt(env,row.family_id,row.source_kind,row.source_id);
 if(!capturedAt)return {ok:false,response:reply({ok:false,error:'SOURCE_DATE_UNAVAILABLE'},409)};
 return {ok:true,mime,bytes,caption:row.caption,capturedAt};
}
function sameTransfer(a:PhotoTransfer,b:PhotoTransfer):boolean {
 return a.family_id===b.family_id&&a.member_id===b.member_id&&a.source_kind===b.source_kind&&a.source_id===b.source_id&&a.caption===b.caption&&a.sha256===b.sha256;
}
function encodeTransferPhoto(photo:{mime:string;bytes:Uint8Array;caption:string;capturedAt:number},sourceSha256?:string):Response {
 let binary='';
 for(let offset=0;offset<photo.bytes.length;offset+=8192)binary+=String.fromCharCode(...photo.bytes.subarray(offset,offset+8192));
 return reply({ok:true,mime:photo.mime,base64:btoa(binary),caption:photo.caption,capturedAt:photo.capturedAt,...(sourceSha256?{sourceSha256}:{})});
}
export async function mintPhotoTransfer(request:Request,ctx:AppContext):Promise<Response> {
 if(request.method!=='POST')return reply({ok:false},405);
 if(!ctx.member)return reply({ok:false},401);
 if(!request.headers.get('x-csrf-token')||request.headers.get('x-csrf-token')!==ctx.session.csrfToken)return reply({ok:false},403);
 try{
  const input=JSON.parse(new TextDecoder().decode(await readTransferBody(request,12000)));
  const kind=input.kind,id=Number(input.id),caption=input.caption;
  if(!['message','journal'].includes(kind)||!Number.isSafeInteger(id)||id<1||typeof caption!=='string'||caption.length>2000)return reply({ok:false,error:'INVALID_REQUEST'},400);
  const photo=await sourcePhoto(ctx,kind,id);
  if(!photo.ok){await photo.body?.cancel();return reply({ok:false,error:'写真が見つかりません。先に写真を添付してください。'},404);}
  const sha256=await photoSha256(await readTransferBody(photo,MAX_BYTES));
  const token=await createPhotoTransfer(ctx.env.DB,{familyId:ctx.member.family_id,memberId:ctx.member.id,kind,id,caption,sha256});
  return reply({ok:true,url:`https://mitenya.marinski1112.workers.dev/#import-photo=${token}`,expiresIn:300});
 }catch{return reply({ok:false,error:'受け渡しを準備できませんでした。もう一度お試しください。'},400);}
}
export async function redeemPhotoTransfer(request:Request,env:Env):Promise<Response> {
 if(request.method!=='POST')return reply({ok:false},405);
 try{
  const token=await parseTransferToken(request);
  if(!token)return reply({ok:false},404);
  const row=await claimPhotoTransfer(env.DB,token);
  if(!row)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
  const photo=await resolveTransferPhoto(request,env,row);
  if(!photo.ok)return photo.response;
  return encodeTransferPhoto(photo);
 }catch{return reply({ok:false,error:'TRANSFER_UNAVAILABLE'},503);}
}
export async function consumePhotoTransferRequest(request:Request,env:Env):Promise<Response> {
 if(request.method!=='POST')return reply({ok:false},405);
 try{
  const capability=await parseConsumeCapability(request);
  if(!capability)return reply({ok:false},404);
  if(capability.kind==='recovery'){
   const inspected=await inspectPhotoTransferRecovery(env.DB,capability.recoveryToken);
   if(!inspected)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
   const photo=await resolveTransferPhoto(request,env,inspected);
   if(!photo.ok)return photo.response;
   const consumed=await consumePhotoTransferRecovery(env.DB,capability.recoveryToken);
   if(!consumed)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
   if(!sameTransfer(inspected,consumed))return reply({ok:false,error:'TRANSFER_CHANGED'},409);
   return encodeTransferPhoto(photo,consumed.sha256);
  }
  const inspected=await inspectPhotoTransfer(env.DB,capability.token);
  if(!inspected)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
  const photo=await resolveTransferPhoto(request,env,inspected);
  if(!photo.ok)return photo.response;
  const consumed=capability.recoveryHash
   ?await consumePhotoTransferWithRecovery(env.DB,capability.token,capability.recoveryHash)
   :await consumePhotoTransfer(env.DB,capability.token);
  if(!consumed)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
  if(!sameTransfer(inspected,consumed))return reply({ok:false,error:'TRANSFER_CHANGED'},409);
  return encodeTransferPhoto(photo,consumed.sha256);
 }catch{return reply({ok:false,error:'TRANSFER_UNAVAILABLE'},503);}
}
