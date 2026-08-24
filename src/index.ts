import { json, redirect } from './response';
import { makeContext, layout, liffLogin, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, calendar, messages, shopping, toggle, home, loginPage, createFamilyPage, apiMe, eventApi, eventNew, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired } from './app';
import { openSession, getSessionCookie } from './session';

const text = (r: Response) => r;

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
      if(url.pathname==='/__cf/secrets-health') {
        const names = ['APP_SECRET','LINE_ACCESS_TOKEN','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LIFF_ID','NOTIFY_SECRET'] as const;
        const secrets = Object.fromEntries(names.map((name) => [name, { present: typeof env[name] === 'string' && env[name].length > 0, length: typeof env[name] === 'string' ? env[name].length : 0 }]));
        return json({ok:true,worker:env.ENVIRONMENT||'unknown',secrets});
      }
      if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
      if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env);return authHealth(context);}
      if(url.pathname==='/liff'||url.pathname==='/liff/') {
        const liffContext=await makeContext(request,env);
        // LIFF起動時に既存のWorkerセッションが有効なら、再度IDトークン検証を要求しない。
        // LINE内ブラウザで他ページが正常表示できるのにトップだけ認証画面へ戻るケースを防ぐ。
        if(liffContext.member) return home(liffContext);
        return liffEntryPage(env,url.searchParams.get('next')||'/app/index.php');
      }
      // 認証が必要なページは、例外ベースのリダイレクトに依存せず
      // ルーティング直下で未ログインを処理する。Cloudflare Runtimeでの
      // 例外化/Response処理の差異による1101を避けるため。
      if(url.pathname==='/app/recurring.php') {
        const context=await makeContext(request,env);
        if(!context.member) return new Response(null,{status:302,headers:{Location:new URL('/login.php',request.url).toString()}});
        return recurring(request,context);
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
      if(url.pathname==='/logout.php'||url.pathname==='/logout') return logout(request,env);
      if(url.pathname==='/task/delete.php') return taskDelete(request,context);
      if(url.pathname==='/task/convert_occurrence.php') return convertOccurrence(request,context);
      if(url.pathname==='/app/message_new.php') return messageNew(context);
      if(url.pathname==='/app/shopping_new.php') return shoppingNew(context,url.searchParams.get('date')||'');
      if(url.pathname==='/app/settings_content.php') return settingsContent(context);
      if(url.pathname==='/app/settings_members.php') return settingsMembers(request,context);
      if(url.pathname==='/app/settings_notifications.php') return settingsNotifications(request,context);
      if(url.pathname==='/app/settings_recurring.php') return recurring(request,context);
      if(url.pathname==='/app/logs.php') return logsPage(context);
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

async function taskNew(ctx: any,date:string): Promise<Response>{if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/task/new.php?date='+date));const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all();const body=`<div class="card"><h1>📝 タスク追加</h1><form id="taskForm"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><input type="hidden" name="date" value="${date}"><label>タイトル</label><input name="title" required><label>日付</label><input type="date" name="dateOnly" value="${date}" required><label>開始時刻</label><input type="time" name="startTime"><label>終了時刻</label><input type="time" name="endTime"><label>場所</label><input name="location"><label>担当者</label>${members.results.map((m:any)=>`<label><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}<button>登録する</button></form></div><script>document.getElementById('taskForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=Object.fromEntries(new FormData(f));b.assignees=[...f.querySelectorAll('[name=assignees]:checked')].map(x=>Number(x.value));const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/today.php?date='+encodeURIComponent(b.dateOnly);else alert(d.error||'登録に失敗しました');}</script>`;return new Response(layout('タスク追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})}
async function itemNew(ctx:any,date:string):Promise<Response>{if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date));const body=`<div class="card"><h1>🎒 持ち物追加</h1><form id="itemForm"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>持ち物名</label><input name="name" required><label>日付</label><input type="date" name="date" value="${date}"><button>登録する</button></form></div><script>document.getElementById('itemForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/item',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/today.php?date='+encodeURIComponent(b.date);else alert(d.error||'登録に失敗しました');}</script>`;return new Response(layout('持ち物追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})}

async function taskApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='DELETE'){const id=Number(new URL(request.url).searchParams.get('id')||0);const csrf=request.headers.get('x-csrf')||'';if(!id||csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'削除情報が不正です。'},403);const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first();if(!task)return json({ok:false,error:'対象が見つかりません。'},404);const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);await ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).run();return json({ok:true});}
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
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
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
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
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { console.error(e); }
      }
    }
  } catch(e) { console.error('[Family TODO LINE] webhook',e); }
  return new Response('OK',{status:200});
}

async function processNotifications(env: Env): Promise<void> {
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status='pending' AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 AND m.line_user_id IS NOT NULL ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all();
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


async function logout(request:Request,env:Env):Promise<Response>{
  const headers=new Headers({'Location':'/login.php','Set-Cookie':'family_line_cf=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  return new Response(null,{status:302,headers});
}

async function taskDelete(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST'&&request.method!=='DELETE') return json({ok:false,error:'POST/DELETE only'},405);
  const m=ctx.member;if(!m)return redirect('/login.php');
  const id=Number(new URL(request.url).searchParams.get('id')||0) || Number((await request.clone().json().catch(()=>({}))).id||0);
  if(!id)return json({ok:false,error:'idが不正です。'},400);
  const body=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
  const csrf=request.headers.get('x-csrf')||String(body.csrf||'');
  if(csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first();
  if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
    ctx.env.DB.prepare('DELETE FROM task_completion_history WHERE task_id=?').bind(id),
    ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id),
    ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id),
  ]);
  return json({ok:true,redirect:'/today.php'});
}

async function convertOccurrence(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const b=await request.json().catch(()=>({})) as any;
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const occId=Number(b.occurrence_id||0);if(!occId)return json({ok:false,error:'発生日が不正です。'},400);
  const occ=await ctx.env.DB.prepare('SELECT o.*,r.task_id,r.name,r.recurrence_type,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id JOIN tasks t ON t.id=r.task_id WHERE o.id=? AND o.family_id=? LIMIT 1').bind(occId,m.family_id).first();
  if(!occ)return json({ok:false,error:'発生日が見つかりません。'},404);
  if(occ.exception_task_id)return json({ok:true,task_id:Number(occ.exception_task_id),redirect:`/task/view.php?id=${Number(occ.exception_task_id)}`});
  const date=String(occ.occurrence_date);const base=String(occ.start_at||'');const st=base.slice(11,19);const et=String(occ.end_at||'').slice(11,19);const now=nowJst();
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,0)').bind(m.family_id,occ.title,occ.description||null,`${date} ${st||'00:00:00'}`,'pending',occ.completion_mode||'ANY',m.id,now,now,st?`${date} ${st}`:null,et?`${date} ${et}`:null,occ.location||null,Number(occ.all_day??1),Number(occ.calendar_visible??1),'OCCURRENCE',null,0).run();
  const taskId=Number(r.meta.last_row_id);
  await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,occId,m.family_id).run();
  return json({ok:true,task_id:taskId,redirect:`/task/view.php?id=${taskId}`});
}

async function logsPage(ctx:any):Promise<Response>{
  if(!ctx.member)return redirect('/login.php');
  const m=ctx.member;const role=String(m.role||'').toUpperCase();if(role!=='OWNER'&&role!=='ADMIN')return new Response('管理者権限が必要です。',{status:403});
  const rows=await ctx.env.DB.prepare('SELECT a.*,m.name member_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id WHERE a.family_id=? ORDER BY a.occurred_at DESC,a.id DESC LIMIT 200').bind(m.family_id).all();
  const esc=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const body=`<div class="card"><h1>操作ログ</h1>${rows.results.map((r:any)=>`<div class="row"><strong>${esc(r.action)}</strong><div class="meta">${esc(r.member_name||'')} ・ ${esc(r.occurred_at||'')}</div><div class="meta">${esc(r.target_type||'')} ${esc(r.target_id||'')}</div></div>`).join('')||'<p>ログはありません。</p>'}</div>`;
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/family.css"><title>操作ログ</title></head><body><main class="wrap">${body}<p><a class="btn" href="/app/settings.php">管理へ戻る</a></p></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
}
