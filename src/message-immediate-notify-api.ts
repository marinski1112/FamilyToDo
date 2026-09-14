import type { AppContext } from './app-context';
import { processNotifications } from './notification-delivery';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date());

/** Queue and immediately dispatch the same notification channel used by scheduled Messages reminders. */
export async function messageImmediateNotifyApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){
    if(error instanceof RequestBodyParseError)return json({ok:false,error:error.message||'入力内容が不正です。'},400);
    throw error;
  }
  const csrf=String(body.csrf||''),expected=String(ctx.session.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF検証に失敗しました。'},403);

  const text=String(body.text??'').trim()||'スタンプ';
  if(Array.from(text).length>5000)return json({ok:false,error:'伝言は5000文字以内にしてください。'},400);
  const target=Number(body.target_member_id||0)||null;
  if(target){
    const recipient=await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL LIMIT 1')
      .bind(target,member.family_id).first<Row>();
    if(!recipient)return json({ok:false,error:'宛先のメンバーが見つかりません。'},400);
  }

  const recipients=target
    ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(target,member.family_id).all<Row>()
    : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL AND id<>?').bind(member.family_id,member.id).all<Row>();
  if(!recipients.results.length)return json({ok:true,queued:0});

  const now=nowJst();
  const nonce=Date.now()*1000+Math.floor(Math.random()*1000);
  await ctx.env.DB.batch(recipients.results.map(recipient=>ctx.env.DB.prepare(
    'INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(member.family_id,Number(recipient.id),'message_immediate','message_immediate',nonce,now,'pending',`【伝言】\n${text}`,now)));

  const delivery=processNotifications(ctx.env);
  if(ctx.executionContext)ctx.executionContext.waitUntil(delivery);
  else await delivery;
  return json({ok:true,queued:recipients.results.length});
}
