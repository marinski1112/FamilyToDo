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

  const messageId=Number(body.message_id||0);
  if(!Number.isSafeInteger(messageId)||messageId<=0)return json({ok:false,error:'伝言IDが不正です。'},400);
  const message=await ctx.env.DB.prepare(`SELECT msg.text,msg.target_member_id,msg.reminder_at,asset.name stamp_name
    FROM messages msg LEFT JOIN message_stamp_attachments stamp ON stamp.message_id=msg.id AND stamp.family_id=msg.family_id
    LEFT JOIN calendar_stamp_assets asset ON asset.id=stamp.asset_id AND asset.family_id=msg.family_id
    WHERE msg.id=? AND msg.family_id=? AND msg.sender_id=? LIMIT 1`).bind(messageId,member.family_id,member.id).first<Row>();
  if(!message)return json({ok:false,error:'伝言が見つかりません。'},404);
  const now=nowJst();
  if(message.reminder_at&&String(message.reminder_at)>now)return json({ok:false,error:'予約中の伝言です。'},409);
  const text=message.stamp_name?`スタンプ: ${String(message.stamp_name).slice(0,80)}`:String(message.text||'').replace(/\s+/gu,' ').trim().slice(0,120)||'伝言';
  const target=Number(message.target_member_id||0)||null;

  const recipients=target
    ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(target,member.family_id).all<Row>()
    : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL AND id<>?').bind(member.family_id,member.id).all<Row>();
  if(!recipients.results.length)return json({ok:true,queued:0});

  // A stable notification identity makes retries safe and ties delivery to the saved message.
  await ctx.env.DB.batch(recipients.results.map(recipient=>ctx.env.DB.prepare(
    'INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(member.family_id,Number(recipient.id),'message_immediate','message',messageId,now,'pending',`【伝言】\n${text}`,now)));

  const delivery=processNotifications(ctx.env);
  if(ctx.executionContext)ctx.executionContext.waitUntil(delivery);
  else await delivery;
  return json({ok:true,queued:recipients.results.length});
}
