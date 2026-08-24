import { json, redirect } from './response';
import { makeContext, liffLogin, createFamily, joinFamily, today, tomorrow, calendar, messages, shopping, toggle, home, loginPage, createFamilyPage, apiMe, eventApi, eventNew, taskView, taskEdit, itemEdit, shoppingEdit, settings, inviteCreate, invitePage, recurring, AuthRequired } from './app';
import { openSession, getSessionCookie } from './session';

const text = (r: Response) => r;

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
      if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
      // Session-backed routes require APP_SECRET. Keep the failure explicit instead of
      // allowing CryptoKey/session initialization to become an opaque Worker 1101.
      if(!env.APP_SECRET){
        console.error('[FamilyTODO] Required secret APP_SECRET is not configured for this deployment.');
        return new Response('<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>Family TODO LINE - 設定エラー</title></head><body><h1>設定エラー</h1><p>Cloudflare Worker の APP_SECRET が設定されていません。</p><p>Cloudflare Dashboard の Variables and Secrets → Secrets で、Production Worker に APP_SECRET を登録してから再Deployしてください。</p></body></html>',{status:500,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      }
      const context=await makeContext(request,env);
      if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return liffLogin(request,context);
      if(url.pathname==='/api/family/create') return createFamily(request,context);
      if(url.pathname==='/api/family/join') return joinFamily(request,context);
      if(url.pathname==='/api/family/invite') return inviteCreate(request,context);
      if(url.pathname==='/api/me') return apiMe(context);
      if(url.pathname==='/api/toggle') return toggle(request,context);
      if(url.pathname==='/api/task') return taskApi(request,context);
      if(url.pathname==='/api/item') return itemApi(request,context);
      if(url.pathname==='/api/event') return eventApi(request,context);
      if(url.pathname==='/api/messages') return messages(request,context);
      if(url.pathname==='/api/shopping') return shopping(request,context);
      if(url.pathname==='/api/settings') return settings(request,context);
      if(url.pathname==='/login.php'||url.pathname==='/login') return loginPage(env);
      if(url.pathname==='/family/create.php'||url.pathname==='/family/create') return createFamilyPage(context);
      if(url.pathname==='/family/join.php'||url.pathname==='/family/join') return invitePage(context,url.searchParams.get('token')||'');
      if(url.pathname==='/app/recurring.php') return recurring(request,context);
      if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return home(context);
      if(url.pathname==='/today.php') return today(request,context,url.searchParams.get('date')||asDateOffset(0));
      if(url.pathname==='/tomorrow.php') return tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1));
      if(url.pathname==='/app/calendar.php') return calendar(request,context,url.searchParams.get('month')||asDateOffset(0).slice(0,7));
      if(url.pathname==='/app/messages.php') return messages(request,context);
      if(url.pathname==='/app/shopping.php') return shopping(request,context);
      if(url.pathname==='/app/settings.php') return settings(request,context);
      if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return toggle(request,context);
      if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return reorderApi(request,context);
      if(url.pathname.startsWith('/app/api/webhook')) return webhook(request,env);
      if(url.pathname==='/task/new.php') return taskNew(context,url.searchParams.get('date')||asDateOffset(0));
      if(url.pathname==='/task/view.php') return taskView(context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/task/edit.php') return taskEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/item/new.php') return itemNew(context,url.searchParams.get('date')||asDateOffset(0));
      if(url.pathname==='/item/edit.php') return itemEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/app/shopping_edit.php') return shoppingEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/calendar/event/new') return eventNew(context,url.searchParams.get('date')||asDateOffset(0));
      return env.ASSETS.fetch(request);
    }catch(e:any){
      if(e instanceof AuthRequired) return redirect('/login.php');
      console.error(e);
      return json({ok:false,error:e?.message||'内部エラーです。'},500);
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext){
    if(env.NOTIFY_MODE !== 'scheduled'){ console.log(`[Family TODO LINE] scheduled ${controller.cron}; notify_mode=${env.NOTIFY_MODE}`); return; }
    ctx.waitUntil(processNotifications(env));
  }
} satisfies ExportedHandler<Env>;

async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>n>0):[];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i, new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' '),id,m.family_id)));return json({ok:true});}

async function taskNew(ctx: any,date:string): Promise<Response>{if(!ctx.member)return redirect('/login.php');const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all();const body=`<div class="card"><h1>📝 タスク追加</h1><form id="taskForm"><input type="hidden" name="date" value="${date}"><label>タイトル</label><input name="title" required><label>日付</label><input type="date" name="dateOnly" value="${date}" required><label>開始時刻</label><input type="time" name="startTime"><label>終了時刻</label><input type="time" name="endTime"><label>場所</label><input name="location"><label>担当者</label>${members.results.map((m:any)=>`<label><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}<button>登録する</button></form></div><script>document.getElementById('taskForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=Object.fromEntries(new FormData(f));b.assignees=[...f.querySelectorAll('[name=assignees]:checked')].map(x=>Number(x.value));const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/today.php?date='+encodeURIComponent(b.dateOnly);else alert(d.error||'登録に失敗しました');}</script>`;return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/family.css"><title>タスク追加</title></head><body><div class="wrap">${body}</div></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}})}
async function itemNew(ctx:any,date:string):Promise<Response>{if(!ctx.member)return redirect('/login.php');const body=`<div class="card"><h1>🎒 持ち物追加</h1><form id="itemForm"><label>持ち物名</label><input name="name" required><label>日付</label><input type="date" name="date" value="${date}"><button>登録する</button></form></div><script>document.getElementById('itemForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/item',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/today.php?date='+encodeURIComponent(b.date);else alert(d.error||'登録に失敗しました');}</script>`;return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/family.css"><title>持ち物追加</title></head><body><div class="wrap">${body}</div></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}})}

async function taskApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='DELETE'){const id=Number(new URL(request.url).searchParams.get('id')||0);const csrf=request.headers.get('x-csrf')||'';if(!id||csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'削除情報が不正です。'},403);const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first();if(!task)return json({ok:false,error:'対象が見つかりません。'},404);const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);await ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).run();return json({ok:true});}
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  const title=String(b.title??'').trim();const date=String(b.dateOnly??'').trim();
  if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({ok:false,error:'タイトルと日付を入力してください。'},400);
  const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();
  const start=st?`${date} ${st}:00`:null;const end=et?`${date} ${et}:00`:null;
  if(start&&end&&end<start)return json({ok:false,error:'終了時刻は開始時刻以降にしてください。'},400);
  const now=nowJst();
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,calendar_visible,task_kind,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,NULL,0)').bind(m.family_id,title,String(b.description??'')||null,end?end:(start?start:`${date} 00:00:00`),'pending','ANY',m.id,now,now,start,end,String(b.location??'')||null).run();
  const id=Number(r.meta.last_row_id);
  const ids=Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
  if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
  return json({ok:true,id},201);
}

async function itemApi(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  const name=String(b.name??'').trim();const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  const now=nowJst();const r=await ctx.env.DB.prepare(`INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at) VALUES(?,?,?,'pending','ANY',?,?,?)`).bind(m.family_id,name,/^\d{4}-\d{2}-\d{2}$/.test(date)?`${date} 00:00:00`:null,m.id,now,now).run();
  return json({ok:true,id:Number(r.meta.last_row_id)},201);
}


async function verifyLineWebhook(body: string, signature: string, secret: string): Promise<boolean> {
  if (!body || !signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let binary=''; for(const b of digest) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  return expected === signature;
}

async function webhook(request: Request, env: Env): Promise<Response> {
  if(request.method !== 'POST') return new Response('OK',{status:200});
  const body = await request.text();
  const sig = request.headers.get('x-line-signature') || '';
  if(!(await verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET))) return new Response('OK',{status:200});
  try {
    const data = JSON.parse(body) as {events?:Array<any>};
    for(const event of data.events||[]) {
      const userId = String(event?.source?.userId||'');
      const now = nowJst();
      const member = userId ? await env.DB.prepare('SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(userId).first<any>() : null;
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
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { console.error(e); }
      }
    }
  } catch(e) { console.error('[Family TODO LINE] webhook',e); }
  return new Response('OK',{status:200});
}

async function processNotifications(env: Env): Promise<void> {
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status='pending' AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 AND m.line_user_id IS NOT NULL ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all<any>();
  for(const n of due.results) {
    try {
      const { pushLineMessage } = await import('./line');
      await pushLineMessage(env.LINE_ACCESS_TOKEN,String(n.line_user_id),String(n.message||'Family TODO LINEからのお知らせです。'));
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=? WHERE id=?').bind('sent',nowJst(),n.id).run();
    } catch(e) {
      await env.DB.prepare('UPDATE notifications SET status=? WHERE id=?').bind('error',n.id).run().catch(()=>{});
      console.error('[Family TODO LINE] notification',e);
    }
  }
}
