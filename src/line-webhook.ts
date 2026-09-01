import { logLineWebhookFailure } from './observability/errors';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

async function verifyLineWebhook(body: string, signature: string, secret: string): Promise<boolean> {
  if (!body || !signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let binary=''; for(const b of digest) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  return expected === signature;
}

export async function webhook(request: Request, env: Env): Promise<Response> {
  if(request.method !== 'POST') return new Response('OK',{status:200});
  const body = await request.text();
  const sig = request.headers.get('x-line-signature') || '';
  if(!(await verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET))) return new Response('OK',{status:200});
  try {
    const data = JSON.parse(body) as {events?:Array<any>};
    for(const event of data.events||[]) {
      const userId = String(event?.source?.userId||'');
      const now = nowJst();
      const member = userId ? await env.DB.prepare('SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(userId).first() : null;
      if(member) {
        await env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(member.family_id,member.id,`LINE_${String(event.type||'UNKNOWN').toUpperCase()}`,event.message?.type||event.postback?.data||null,null,JSON.stringify({event_type:event.type,message_type:event.message?.type||null}),now).run();
      }
      if(event.type==='message' && event.message?.type==='text' && event.replyToken && env.LINE_ACCESS_TOKEN) {
        const text=String(event.message.text||'').trim();
        let reply='Family TODO LINEを受信しました。';
        if(text==='今日') reply='今日の予定はFamily TODO LINEの「今日」から確認できます。';
        else if(text==='明日') reply='明日の予定はFamily TODO LINEの「明日の準備」から確認できます。';
        else if(text==='買い物') reply='買い物リストはFamily TODO LINEの「買い物」から確認できます。';
        const { replyLineMessage } = await import('./line');
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { logLineWebhookFailure('reply',e); }
      }
    }
  } catch(e) { logLineWebhookFailure('handle',e); }
  return new Response('OK',{status:200});
}
