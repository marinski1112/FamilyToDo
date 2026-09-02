import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { sendWebPush, webPushConfigured } from './webpush';

type Row = Record<string, unknown>;

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

const badRequest=(message:string)=>json({ok:false,error:message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
const forbidden=(message:string)=>json({ok:false,error:message||'この操作は許可されていません。',code:'FORBIDDEN'},403);

/** Canonical Web Push subscription/test API independent from the legacy app.ts monolith. */
export async function webPushApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  let b:Record<string,unknown>;
  try{
    b=await bodyJson(request);
  }catch(error){
    if(error instanceof RequestBodyParseError)return badRequest(error.message);
    throw error;
  }
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof b.csrf!=='string'||b.csrf!==ctx.session.csrfToken)return forbidden('CSRF検証に失敗しました。');
  const action=new URL(request.url).pathname.split('/').pop()||'';
  const now=nowJst();
  if(action==='subscribe'){
    if(!webPushConfigured(ctx.env))return json({ok:false,error:'Web Push用VAPID鍵が未設定です。'},503);
    const sub=(b.subscription&&typeof b.subscription==='object'&&!Array.isArray(b.subscription))?b.subscription as Record<string,unknown>:{};
    const keys=(sub.keys&&typeof sub.keys==='object'&&!Array.isArray(sub.keys))?sub.keys as Record<string,unknown>:{};
    const endpoint=String(sub.endpoint||'').trim(),p256dh=String(keys.p256dh||'').trim(),auth=String(keys.auth||'').trim();
    if(!endpoint||!p256dh||!auth)return badRequest('Push購読情報が不正です。');
    let parsed:URL;try{parsed=new URL(endpoint)}catch{return badRequest('Push endpointが不正です。');}
    if(parsed.protocol!=='https:'||endpoint.length>2500||p256dh.length>500||auth.length>500)return badRequest('Push購読情報が不正です。');
    await ctx.env.DB.prepare(`INSERT INTO web_push_subscriptions(family_id,member_id,endpoint,p256dh,auth,user_agent,enabled,failure_count,created_at,updated_at) VALUES(?,?,?,?,?,?,1,0,?,?) ON CONFLICT(member_id,endpoint) DO UPDATE SET family_id=excluded.family_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,enabled=1,failure_count=0,last_error=NULL,updated_at=excluded.updated_at`).bind(m.family_id,m.id,endpoint,p256dh,auth,String(request.headers.get('user-agent')||'').slice(0,500),now,now).run();
    await ctx.env.DB.prepare("UPDATE members SET notification_enabled=1,notification_channel='WEB_PUSH',updated_at=? WHERE id=? AND family_id=?").bind(now,m.id,m.family_id).run();
    return json({ok:true,channel:'WEB_PUSH'});
  }
  if(action==='unsubscribe'){
    const endpoint=String(b.endpoint||'').trim(),subscriptionId=Number(b.subscription_id||0);
    if(subscriptionId)await ctx.env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=? AND member_id=? AND family_id=?').bind(subscriptionId,m.id,m.family_id).run();
    else if(endpoint)await ctx.env.DB.prepare('DELETE FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND endpoint=?').bind(m.id,m.family_id,endpoint).run();
    const left=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1').bind(m.id,m.family_id).first<Row>();
    if(Number(left?.c||0)===0)await ctx.env.DB.prepare("UPDATE members SET notification_channel='LINE',updated_at=? WHERE id=? AND family_id=? AND notification_channel='WEB_PUSH'").bind(now,m.id,m.family_id).run();
    return json({ok:true,active:Number(left?.c||0)});
  }
  if(action==='test'){
    if(!webPushConfigured(ctx.env))return json({ok:false,error:'Web Push用VAPID鍵が未設定です。'},503);
    const subs=await ctx.env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1 ORDER BY id DESC LIMIT 10').bind(m.id,m.family_id).all<Row>();
    if(!subs.results.length)return json({ok:false,error:'このメンバーのWeb Push購読がありません。'},400);
    let sent=0,failed=0;
    for(const row of subs.results){
      const result=await sendWebPush(ctx.env,{id:Number(row.id),endpoint:String(row.endpoint),p256dh:String(row.p256dh),auth:String(row.auth)},{title:'Family TODO LINE',body:'Web Pushのテスト通知です。',url:'/app/tasks.php',tag:'familytodo-test'});
      if(result.ok){sent++;await ctx.env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?,last_error=NULL,failure_count=0,updated_at=? WHERE id=?').bind(now,now,Number(row.id)).run();}
      else{failed++;if(result.gone)await ctx.env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(Number(row.id)).run();else await ctx.env.DB.prepare('UPDATE web_push_subscriptions SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE id=?').bind(String(result.error||`HTTP ${result.status}`).slice(0,500),now,Number(row.id)).run();}
    }
    return json({ok:sent>0,sent,failed,error:sent?'':'テスト通知を送信できませんでした。'},sent?200:502);
  }
  return json({ok:false,error:'Unknown push action'},404);
}
