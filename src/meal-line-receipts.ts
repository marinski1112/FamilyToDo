import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealEnabled,mealHash,mealId} from './meal-domain';
import {readMealReceipt} from './meal-receipts';
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
const key=async(secret:string)=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('meal-line-receipt:v1:'+secret)),'AES-GCM',false,['encrypt','decrypt']);
async function seal(messageId:string,secret:string,familyId:number,id:string){const iv=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode(JSON.stringify([familyId,id])),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(secret),new TextEncoder().encode(messageId));return b64(iv)+'.'+b64(new Uint8Array(cipher));}
async function open(cipher:string,secret:string,familyId:number,id:string){const [iv,data]=cipher.split('.'),bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(JSON.stringify([familyId,id]))},await key(secret),bytes(data)));}
export async function expireLineReceipts(db:D1Database){await db.prepare("UPDATE meal_line_receipts SET source_cipher=NULL,status='EXPIRED' WHERE source_cipher IS NOT NULL AND expires_at<=?").bind(Date.now()).run();}
/** Signature and active-member resolution belong to the existing webhook caller. No bytes are downloaded here. */
export async function receiveMealLineReceipt(env:Env,event:any,member:{id:number;family_id:number}|null):Promise<string|null>{
 if(!mealEnabled(env)||!member||event?.type!=='message'||event?.source?.type!=='user')return null;
 const command=event.message?.type==='text'&&String(event.message.text||'').normalize('NFKC').trim()==='レシート',image=event.message?.type==='image'&&event.message?.contentProvider?.type==='line';
 if(!command&&!image)return null;
 if(!env.LINE_ACCESS_TOKEN||!env.APP_SECRET)return command?'LINEの写真受信は未設定です。Webの「ごはん → レシート」から取り込んでください。':null;
 const sent=event.timestamp,now=Date.now(),transport=event.webhookEventId||event.message.id;
 if(!Number.isSafeInteger(sent)||sent>now+30000||typeof transport!=='string'||!transport||transport.length>256)return null;
 const db=env.MEALS_DB!,id='line-receipt-'+(await mealHash([member.family_id,transport])).slice(0,48);
 await expireLineReceipts(db);
 if(command){
  if(sent<now-600000)return null;
  await db.prepare('INSERT INTO meal_line_receipt_modes(family_id,member_id,command_id,sent_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(family_id,member_id) DO UPDATE SET command_id=excluded.command_id,sent_at=excluded.sent_at,expires_at=excluded.expires_at,consumed_id=NULL WHERE excluded.sent_at>meal_line_receipt_modes.sent_at AND excluded.command_id<>meal_line_receipt_modes.command_id').bind(member.family_id,member.id,id,sent,sent+600000).run();
  return '次の10分以内にレシート写真を1枚送ってください。Webの「ごはん → 受信箱」で家族が確認できます。読み取りはWebで開始し、画像は保存しません。';
 }
 const existing=await db.prepare('SELECT id FROM meal_line_receipts WHERE family_id=? AND id=?').bind(member.family_id,id).first();if(existing)return 'レシート写真を受け付けました。Webの「ごはん → 受信箱」で24時間以内に確認してください。';
 const mode=await db.prepare('SELECT command_id,sent_at,expires_at,consumed_id FROM meal_line_receipt_modes WHERE family_id=? AND member_id=?').bind(member.family_id,member.id).first<{command_id:string;sent_at:number;expires_at:number;consumed_id:string|null}>();
 if(!mode||mode.consumed_id||mode.expires_at<=now||sent<mode.sent_at||sent>mode.expires_at)return null;
 const messageId=event.message.id;if(typeof messageId!=='string'||!/^\d{1,64}$/.test(messageId))return null;
 const cipher=await seal(messageId,env.APP_SECRET,member.family_id,id),date=new Date(now).toISOString();
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO meal_line_receipts(family_id,id,created_by,source_cipher,expires_at,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM meal_line_receipt_modes WHERE family_id=? AND member_id=? AND command_id=? AND consumed_id IS NULL AND expires_at>?) AND (SELECT COUNT(*) FROM meal_line_receipts WHERE family_id=? AND created_at>=?)<20").bind(member.family_id,id,member.id,cipher,now+86400000,date,member.family_id,member.id,mode.command_id,now,member.family_id,date.slice(0,10)),
  db.prepare('UPDATE meal_line_receipt_modes SET consumed_id=? WHERE family_id=? AND member_id=? AND command_id=? AND consumed_id IS NULL AND EXISTS(SELECT 1 FROM meal_line_receipts WHERE family_id=? AND id=?)').bind(id,member.family_id,member.id,mode.command_id,member.family_id,id)
 ]);
 return await db.prepare('SELECT id FROM meal_line_receipts WHERE family_id=? AND id=?').bind(member.family_id,id).first()?'レシート写真を受け付けました。Webの「ごはん → 受信箱」で24時間以内に確認してください。':'今日のLINEレシート受信は20件までです。Webから取り込んでください。';
}
export async function readLineReceipts(ctx:AppContext){const db=ctx.env.MEALS_DB!;await expireLineReceipts(db);return (await db.prepare("SELECT id,created_at FROM meal_line_receipts WHERE family_id=? AND status='PENDING' AND expires_at>? ORDER BY created_at DESC LIMIT 20").bind(ctx.member!.family_id,Date.now()).all()).results;}
export async function dismissLineReceipt(ctx:AppContext,id:string){await ctx.env.MEALS_DB!.prepare("UPDATE meal_line_receipts SET status='DISMISSED',source_cipher=NULL WHERE family_id=? AND id=? AND status='PENDING'").bind(ctx.member!.family_id,id).run();}
export async function completeLineReceipt(ctx:AppContext,id:string){await ctx.env.MEALS_DB!.prepare("UPDATE meal_line_receipts SET status='CONSUMED',source_cipher=NULL WHERE family_id=? AND id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM receipt_imports WHERE family_id=? AND id=? AND status='READY' AND error_code IS NULL)").bind(ctx.member!.family_id,id,ctx.member!.family_id,id).run();}
/** Fixed LINE endpoint, bounded in-memory bytes; no raw image, message ID or token reaches logs/storage. */
export async function prepareLineReceipt(ctx:AppContext,rawId:unknown){
 const id=mealId(rawId),db=ctx.env.MEALS_DB!,familyId=Number(ctx.member!.family_id);await expireLineReceipts(db);
 const row=await db.prepare('SELECT status,source_cipher,expires_at FROM meal_line_receipts WHERE family_id=? AND id=?').bind(familyId,id).first<{status:string;source_cipher:string|null;expires_at:number}>();
 if(!row||row.status==='DISMISSED')throw new BadRequest('受信したレシートが見つかりません。');
 const saved=await db.prepare('SELECT status FROM receipt_imports WHERE family_id=? AND id=?').bind(familyId,id).first<{status:string}>();
 if(saved){const receipt=await readMealReceipt(ctx,id);if(!receipt.error)await completeLineReceipt(ctx,id);return {receipt};}
 if(!row.source_cipher||row.expires_at<=Date.now()||!ctx.env.LINE_ACCESS_TOKEN)throw new BadRequest('写真の取得期限が過ぎたか、取得できません。Webから写真を選び直してください。');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const messageId=await open(row.source_cipher,ctx.env.APP_SECRET,familyId,id);if(!/^\d{1,64}$/.test(messageId))throw new Error();
  const response=await fetch('https://api-data.line.me/v2/bot/message/'+messageId+'/content',{headers:{Authorization:'Bearer '+ctx.env.LINE_ACCESS_TOKEN},redirect:'error',signal:controller.signal});
  const mime=response.headers.get('content-type')?.split(';')[0].trim();if(!response.ok||!mime||!['image/jpeg','image/png','image/webp'].includes(mime)||Number(response.headers.get('content-length')||0)>4194304||!response.body)throw new Error();
  reader=response.body.getReader();const chunks:Uint8Array[]= [];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4194304)throw new Error();chunks.push(value);}if(size<16)throw new Error();
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const header=String.fromCharCode(...bytes.slice(0,12)),valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?header.startsWith('\x89PNG\r\n\x1a\n'):header.startsWith('RIFF')&&header.slice(8,12)==='WEBP';if(!valid)throw new Error();
  return {image:{mime_type:mime,image_base64:b64(bytes)}};
 }catch{throw new BadRequest('LINEの写真を取得できませんでした。期限やサイズを確認し、Webから写真を選び直してください。');}
 finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});controller.abort();}
}
