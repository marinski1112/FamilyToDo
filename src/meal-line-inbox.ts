import {mealEnabled,mealHash} from './meal-domain';
/** Explicit meal input only; no provider request, URL fetch or free-form inference. */
export function parseMealLineText(raw:unknown):{kind:'WISH'|'RECIPE_URL';content:string}|null{
 if(typeof raw!=='string'||raw.length>4096)return null;
 const text=raw.normalize('NFKC').trim();
 const wish=/^(.{1,120}?)\s*食べたい[!！。]*$/u.exec(text)||/^食べたい[\s:：]+(.{1,120})$/u.exec(text);
 if(wish&&wish[1].trim()&&!/[\r\n]/.test(wish[1])&&!/https?:\/\//i.test(wish[1]))return {kind:'WISH',content:wish[1].trim()};
 const candidate=text.replace(/^レシピ[\s:：]+/u,'');
 try{const u=new URL(candidate);if(candidate.length<=2048&&['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return {kind:'RECIPE_URL',content:u.href};}catch{}
 return null;
}
/** Caller must verify the LINE signature and resolve an active linked member first. */
export async function receiveMealLine(env:Env,event:any,member:{id:number;family_id:number}|null):Promise<string|null>{
 if(!mealEnabled(env)||!member||event?.type!=='message'||event?.message?.type!=='text'||event?.source?.type!=='user')return null;
 const input=parseMealLineText(event.message.text);if(!input)return null;
 // IDs are transport deduplication keys, never derived from user text or timestamps.
 const eventId=event.webhookEventId||event.message.id;
 if(typeof eventId!=='string'||!eventId||eventId.length>256)return 'ごはんの受信箱に保存できませんでした。Webから登録してください。';
 const id='line-'+await mealHash([member.family_id,eventId]),now=new Date().toISOString();
 await env.MEALS_DB!.prepare('INSERT OR IGNORE INTO meal_inbox(family_id,id,kind,content,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(member.family_id,id,input.kind,input.content,member.id,now,now).run();
 return 'ごはんの受信箱に保存しました。Webの「ごはん → 受信箱」で確認してください。';
}
