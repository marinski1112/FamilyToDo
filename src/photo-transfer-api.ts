import type {AppContext} from './app-context';
import {memberById} from './app-context';
import {familyLogMediaApi} from './family-log-media-api';
import {messagePhotoApi} from './message-photo-api';
import {createPhotoTransfer,claimPhotoTransfer} from './photo-transfer-service';
const MAX_BYTES=4*1024*1024;
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
export async function mintPhotoTransfer(request:Request,ctx:AppContext):Promise<Response> {
 if(request.method!=='POST')return reply({ok:false},405);
 if(!ctx.member)return reply({ok:false},401);
 if(!request.headers.get('x-csrf-token')||request.headers.get('x-csrf-token')!==ctx.session.csrfToken)return reply({ok:false},403);
 try{
  const input=JSON.parse(new TextDecoder().decode(await readTransferBody(request,12000)));
  const kind=input.kind,id=Number(input.id),caption=input.caption;
  if(!['message','journal'].includes(kind)||!Number.isSafeInteger(id)||id<1||typeof caption!=='string'||caption.length>2000)return reply({ok:false,error:'INVALID_REQUEST'},400);
  const photo=await sourcePhoto(ctx,kind,id);await photo.body?.cancel();
  if(!photo.ok)return reply({ok:false,error:'写真が見つかりません。先に写真を添付してください。'},404);
  const token=await createPhotoTransfer(ctx.env.DB,{familyId:ctx.member.family_id,memberId:ctx.member.id,kind,id,caption});
  return reply({ok:true,url:`https://mitenya.marinski1112.workers.dev/#import-photo=${token}`,expiresIn:300});
 }catch{return reply({ok:false,error:'受け渡しを準備できませんでした。もう一度お試しください。'},400);}
}
export async function redeemPhotoTransfer(request:Request,env:Env):Promise<Response> {
 if(request.method!=='POST')return reply({ok:false},405);
 try{
  const {token}=JSON.parse(new TextDecoder().decode(await readTransferBody(request,128)));
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/u.test(token))return reply({ok:false},404);
  const row=await claimPhotoTransfer(env.DB,token);
  if(!row)return reply({ok:false,error:'TRANSFER_EXPIRED'},410);
  const member=await memberById(env,row.member_id);
  if(!member||member.family_id!==row.family_id)return reply({ok:false},404);
  const ctx={request,env,member,session:{}} as AppContext;
  const photo=await sourcePhoto(ctx,row.source_kind,row.source_id);
  if(!photo.ok){await photo.body?.cancel();return reply({ok:false},404);}
  const mime=photo.headers.get('content-type')||'';
  if(!['image/jpeg','image/png','image/webp'].includes(mime)){await photo.body?.cancel();return reply({ok:false},404);}
  const bytes=await readTransferBody(photo,MAX_BYTES);let binary='';
  for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return reply({ok:true,mime,base64:btoa(binary),caption:row.caption});
 }catch{return reply({ok:false,error:'TRANSFER_UNAVAILABLE'},503);}
}
