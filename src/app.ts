import { withDb } from './db';
import { commitSession, getSessionCookie, openSession } from './session';
import { verifyLineIdToken } from './line';
import { json, html, redirect } from './response';
import type { CurrentMember, SessionData } from './types';

export interface AppContext { request: Request; env: Env; session: SessionData; member: CurrentMember | null; }

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const dateOnly = (d = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

export async function makeContext(request: Request, env: Env): Promise<AppContext> {
  const session = await openSession(getSessionCookie(request), env.APP_SECRET);
  const member = session.memberId ? await memberById(env, session.memberId) : null;
  return { request, env, session, member };
}

export async function memberById(env: Env, id: number): Promise<CurrentMember | null> {
  return (await env.DB.prepare('SELECT * FROM members WHERE id=? AND active=1 LIMIT 1').bind(id).first<CurrentMember>()) ?? null;
}

function requireMember(ctx: AppContext): CurrentMember {
  if (!ctx.member) throw new AuthRequired();
  return ctx.member;
}

export class AuthRequired extends Error {}
class BadRequest extends Error {}

async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('JSONが不正です。');
  return value as Record<string, unknown>;
}

async function ensureCsrf(ctx: AppContext, token: unknown) {
  if (!ctx.session.csrfToken) {
    ctx.session.csrfToken = crypto.randomUUID();
  }
  if (typeof token !== 'string' || token !== ctx.session.csrfToken) throw new BadRequest('CSRF検証に失敗しました。');
}

function layout(title: string, body: string, active = ''): string {
  const nav = `<nav class="bottom-nav"><div class="nav-inner">${[
    ['/today.php','☀️','今日'],['/tomorrow.php','🌙','明日'],['/app/calendar.php','📅','カレンダー'],['/app/shopping.php','🛒','買い物'],['/app/messages.php','💬','伝言'],['/app/settings.php','⚙️','管理']
  ].map(([href,icon,label])=>`<a class="${active===href?'active':''}" href="${href}"><span>${icon}</span>${label}</a>`).join('')}</div></nav>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)} - Family TODO LINE</title><link rel="stylesheet" href="/assets/family.css?v=12.35"></head><body><div class="wrap">${body}</div>${nav}</body></html>`;
}



/**
 * LIFF専用の入口。LIFF Endpoint URLをこのURLにすると、
 * LINEアプリ内から起動→ID Token検証→Workerセッション発行→アプリ画面
 * までを一つの導線で処理する。
 */
export function liffEntryPage(env: Env, nextPath = '/app/index.php'): Response {
  const safeNext = /^\/(?!\/)/.test(nextPath) ? nextPath : '/app/index.php';
  const liffId = env.LINE_LIFF_ID || '';
  const body = `<div class="card liff-entry"><h1>Family TODO LINE</h1><p id="status" class="meta">LIFFを準備しています…</p><div id="error" class="error" style="display:none;white-space:pre-wrap"></div><div id="diag" class="meta" style="white-space:pre-wrap;margin-top:12px"></div><button id="retry" style="display:none" class="btn">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>(async()=>{
const status=document.getElementById('status'),error=document.getElementById('error'),diag=document.getElementById('diag'),retry=document.getElementById('retry');
const next=${JSON.stringify(safeNext)}, liffId=${JSON.stringify(liffId)};
const showDiag=(o)=>{diag.textContent=Object.entries(o).map(([k,v])=>k+': '+String(v)).join('\\n')};
const showError=(stage,e,extra={})=>{const name=e&&e.name?e.name:'';const message=e&&e.message?e.message:String(e);showDiag({stage,liffIdPresent:Boolean(liffId),url:location.href,inClient:typeof liff!=='undefined'&&liff.isInClient?liff.isInClient():'unknown',loggedIn:typeof liff!=='undefined'&&liff.isLoggedIn?liff.isLoggedIn():'unknown',...extra});error.textContent='LIFFエラー\\n'+name+'\\n'+message;error.style.display='block';status.textContent='LIFF初期化に失敗しました。';retry.style.display='inline-flex';console.error('[Family TODO LINE][LIFF]',stage,e)};
async function run(){
  retry.style.display='none';error.style.display='none';status.textContent='LIFF SDKを確認しています…';
  if(typeof liff==='undefined'){showError('sdk_load',new Error('LIFF SDKを読み込めませんでした。'));return;}
  showDiag({stage:'before_init',liffIdPresent:Boolean(liffId),url:location.href,userAgent:navigator.userAgent,inClient:liff.isInClient()});
  try{
    status.textContent='LIFFを初期化しています…';
    await liff.init({liffId});
    showDiag({stage:'init_ok',liffIdPresent:Boolean(liffId),url:location.href,inClient:liff.isInClient(),loggedIn:liff.isLoggedIn(),os:liff.getOS(),language:liff.getLanguage(),version:liff.getVersion()});
    if(!liff.isLoggedIn()){
      status.textContent='LINEログインを開始します…';
      liff.login({redirectUri:location.href});
      return;
    }
    status.textContent='LINE認証情報を確認しています…';
    const idToken=liff.getIDToken();
    if(!idToken) throw new Error('LINE IDトークンを取得できませんでした。LIFFのopenid権限を確認してください。');
    showDiag({stage:'id_token_ok',liffIdPresent:Boolean(liffId),url:location.href,inClient:liff.isInClient(),loggedIn:true,tokenPresent:true});
    const r=await fetch('/app/api/liff_login.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({id_token:idToken})});
    const raw=await r.text();
    let d=null;try{d=JSON.parse(raw)}catch{}
    showDiag({stage:'worker_login_response',httpStatus:r.status,contentType:r.headers.get('content-type')||'',ok:d?.ok===true,workerError:d?.error||''});
    if(!r.ok||!d?.ok) throw new Error(d?.error||('Cloudflare WorkerのLINEログイン処理に失敗しました（HTTP '+r.status+'）。'));
    status.textContent='ログインしました。アプリを開いています…';
    location.replace(next);
  }catch(e){showError('liff_flow',e)}
}
retry.onclick=run;run();
})();</script>`;
  return html(layout('LINE認証',body));
}
export async function authHealth(ctx: AppContext): Promise<Response> {
  return json({
    ok: true,
    cookie_session: Boolean(ctx.session && ctx.session.iat),
    line_user_id_present: Boolean(ctx.session.lineUserId),
    member_id_present: Boolean(ctx.session.memberId),
    family_id_present: Boolean(ctx.session.familyId),
    csrf_present: Boolean(ctx.session.csrfToken),
    member_exists: Boolean(ctx.member),
    member_active: Boolean(ctx.member?.active),
  });
}

export function loginPage(env: Env): Response {
  const body = `<div class="card"><h1>Family TODO LINE</h1><p>LINE認証を開始します。</p><p id="status" class="meta">認証を準備しています…</p><button id="retry" style="display:none">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>(async()=>{const status=document.getElementById('status'),retry=document.getElementById('retry');async function run(){try{retry.style.display='none';status.textContent='LINEを初期化しています…';await liff.init({liffId:${JSON.stringify(env.LINE_LIFF_ID)}});if(!liff.isLoggedIn()){liff.login();return;}status.textContent='認証情報を確認しています…';const idToken=liff.getIDToken();if(!idToken)throw new Error('LINE IDトークンを取得できませんでした。LIFFのopenid権限を確認してください。');const r=await fetch('/app/api/liff_login.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_token:idToken})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'LINEログインに失敗しました。');location.href=d.redirect;}catch(e){status.textContent=e?.message||String(e);retry.style.display='inline-block';}}retry.onclick=run;run();})();</script>`;
  return html(layout('LINE認証',body));
}

export async function liffLogin(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  const body = await bodyJson(request);
  const idToken = typeof body.id_token === 'string' ? body.id_token.trim() : '';
  if (!idToken) return json({ok:false,error:'LINE IDトークンがありません。'},400);
  if (!ctx.env.LINE_CHANNEL_ID) return json({ok:false,error:'LINE_CHANNEL_IDが未設定です。'},500);
  const verified = await verifyLineIdToken(idToken, ctx.env.LINE_CHANNEL_ID).catch(() => null);
  if (!verified) return json({ok:false,error:'LINE IDトークンの検証に失敗しました。'},401);

  ctx.session.lineUserId = verified.sub;
  ctx.session.lineDisplayName = verified.name ?? '';
  ctx.session.csrfToken ??= crypto.randomUUID();
  const member = await ctx.env.DB.prepare('SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(verified.sub).first<{id:number;family_id:number}>();
  if (member) { ctx.session.memberId=Number(member.id); ctx.session.familyId=Number(member.family_id); }
  else { delete ctx.session.memberId; delete ctx.session.familyId; }
  const response = json({ok:true,redirect:member?'/app/index.php':'/family/create.php'});
  return commitSession(response,ctx.session,ctx.env.APP_SECRET);
}

export async function createFamily(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  if (!ctx.session.lineUserId) return json({ok:false,error:'LINE認証が必要です。'},401);
  const body = await bodyJson(request);
  const familyName = String(body.family_name ?? '').trim();
  const memberName = String(body.member_name ?? ctx.session.lineDisplayName ?? '').trim() || 'メンバー';
  if (!familyName || familyName.length>255) return json({ok:false,error:'家族名を入力してください（255文字以内）。'},400);
  const now=nowJst();
  const familyCode = crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  const existing = await ctx.env.DB.prepare('SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(ctx.session.lineUserId).first<{id:number;family_id:number}>();
  if (existing) { ctx.session.memberId=existing.id;ctx.session.familyId=existing.family_id;return commitSession(json({ok:true,redirect:'/app/index.php'}),ctx.session,ctx.env.APP_SECRET); }
  const results = await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO families(family_code,name,created_at,updated_at) VALUES(?,?,?,?)').bind(familyCode,familyName,now,now),
    ctx.env.DB.prepare('SELECT last_insert_rowid() AS id')
  ]);
  const familyId = Number((results[1]?.results?.[0] as Row | undefined)?.id ?? 0);
  if(!familyId) throw new Error('家族IDを取得できませんでした。');
  const memberResult = await ctx.env.DB.prepare('INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(familyId,ctx.session.lineUserId,memberName,'ADULT','OWNER',1,1,now,now).run();
  const memberId = Number(memberResult.meta.last_row_id);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'timezone',JSON.stringify('Asia/Tokyo'),now),
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'week_start',JSON.stringify('MONDAY'),now),
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'default_completion_mode',JSON.stringify('ANY'),now)
  ]);
  ctx.session.memberId=memberId;ctx.session.familyId=familyId;
  return commitSession(json({ok:true,redirect:'/app/index.php',family_id:familyId}),ctx.session,ctx.env.APP_SECRET);
}

export async function joinFamily(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  if (!ctx.session.lineUserId) return json({ok:false,error:'LINE認証が必要です。'},401);
  const body = await bodyJson(request); const code=String(body.family_code??'').trim().toUpperCase();
  const name=String(body.member_name??ctx.session.lineDisplayName??'').trim()||'メンバー';
  if(!code) return json({ok:false,error:'家族コードを入力してください。'},400);
  const family=await ctx.env.DB.prepare('SELECT id,name FROM families WHERE family_code=? LIMIT 1').bind(code).first<{id:number;name:string}>();
  if(!family) return json({ok:false,error:'家族コードが見つかりません。'},404);
  const now=nowJst();
  const existing=await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND line_user_id=? LIMIT 1').bind(family.id,ctx.session.lineUserId).first<{id:number}>();
  let memberId=existing?.id;
  if(!memberId){const r=await ctx.env.DB.prepare('INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(family.id,ctx.session.lineUserId,name,'ADULT','MEMBER',1,1,now,now).run();memberId=Number(r.meta.last_row_id);}
  ctx.session.memberId=memberId;ctx.session.familyId=family.id;
  return commitSession(json({ok:true,redirect:'/app/index.php',family_id:family.id}),ctx.session,ctx.env.APP_SECRET);
}

function parseJsonArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  try { const v=JSON.parse(String(value||'[]')); return Array.isArray(v)?v.map(Number).filter(Number.isFinite):[]; } catch { return []; }
}
function matchesRecurrence(rule: Row, date: string): boolean {
  const start=String(rule.start_date||''); const end=String(rule.end_date||'');
  if (date<start || (end && date>end) || Number(rule.active)!==1) return false;
  const d=new Date(`${date}T12:00:00Z`), sd=new Date(`${start}T12:00:00Z`);
  const interval=Math.max(1,Number(rule.interval_value||1));
  const type=String(rule.recurrence_type||'DAILY');
  const diff=Math.floor((d.getTime()-sd.getTime())/86400000);
  const wd=d.getUTCDay();
  if(type==='DAILY'||type==='INTERVAL_DAYS') return diff%interval===0;
  if(type==='WEEKLY'||type==='INTERVAL_WEEKS') { if(Math.floor(diff/7)%interval!==0)return false; const w=parseJsonArray(rule.weekdays_json); return (w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd); }
  if(type==='MONTHLY_DAY') { const md=parseJsonArray(rule.monthdays_json); const want=md.length?md:[Number(rule.monthday||sd.getUTCDate())]; const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth(); return months>=0&&months%interval===0&&want.includes(d.getUTCDate()); }
  if(type==='MONTHLY_WEEKDAY') { const w=parseJsonArray(rule.weekdays_json); const weeks=Math.floor((d.getUTCDate()-1)/7)+1; const wantWeek=Number(rule.week_number||1); return ((d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth())%interval===0&&(w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd)&&weeks===wantWeek; }
  if(type==='MONTHLY_BUSINESS_DAY') { const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth(); if(months<0||months%interval!==0)return false; let n=0; for(let day=1;day<=d.getUTCDate();day++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),day));const dayOf=x.getUTCDay();if(dayOf>=1&&dayOf<=5)n++;} return n===Number(rule.business_day_ordinal||1); }
  return false;
}
async function recurringForDate(ctx:AppContext,date:string):Promise<Row[]> {
  const rules=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) ORDER BY r.id`).bind(ctx.member!.family_id,date,date).all<Row>();
  const out:Row[]=[];
  for(const r of rules.results){
    if(!matchesRecurrence(r,date)) continue;
    const existing=await ctx.env.DB.prepare('SELECT * FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date=? LIMIT 1').bind(ctx.member!.family_id,r.id,date).first<Row>();
    let occ=existing;
    if(!occ){const now=nowJst();const ins=await ctx.env.DB.prepare('INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(ctx.member!.family_id,r.id,date,'pending',now,now).run();const id=Number(ins.meta.last_row_id);occ={id,status:'pending'};}
    if(occ?.exception_task_id) continue;
    const ass=await ctx.env.DB.prepare('SELECT GROUP_CONCAT(m.name,\'、\') assignees FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=?').bind(r.task_id).first<Row>();
    const baseTime=String(r.start_at||'').slice(11,19); const endTime=String(r.end_at||'').slice(11,19);
    out.push({...r,id:-Number(occ.id),recurrence_occurrence_id:Number(occ.id),recurrence_rule_id:Number(r.id),occurrence_date:date,status:String(occ.status||'pending'),due_at:`${date} ${baseTime||'00:00:00'}`,start_at:baseTime?`${date} ${baseTime}`:null,end_at:endTime?`${date} ${endTime}`:null,assignees:String(ass?.assignees||'')});
  }
  return out;
}

async function makeViewData(ctx: AppContext, date:string) {
  const [tasks,items,recurring] = await Promise.all([
    ctx.env.DB.prepare(`SELECT t.*, GROUP_CONCAT(m.name, '、') AS assignees,
      (SELECT e.title FROM events e WHERE e.id=t.event_id LIMIT 1) AS event_title
      FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members m ON m.id=ta.member_id
      WHERE t.family_id=? AND t.status IN ('pending','completed') AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?))) OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?)))
      GROUP BY t.id ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(ctx.member!.family_id,date,date,date).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*, (SELECT e.title FROM events e WHERE e.id=i.event_id LIMIT 1) AS event_title
      FROM items i WHERE i.family_id=? AND (date(i.due_at)=date(?) OR i.due_at IS NULL) ORDER BY i.status,i.id`).bind(ctx.member!.family_id,date).all<Row>(),
    recurringForDate(ctx,date)
  ]);
  return {date,tasks:[...tasks.results,...recurring].sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at))),items:items.results};
}

export async function today(request: Request, ctx: AppContext, targetDate: string): Promise<Response> { requireMember(ctx); const data=await makeViewData(ctx,targetDate); return html(renderDailyPage(ctx,targetDate,data,false)); }
export async function tomorrow(request: Request, ctx: AppContext, targetDate: string): Promise<Response> { requireMember(ctx); const data=await makeViewData(ctx,targetDate); return html(renderDailyPage(ctx,targetDate,data,true)); }

function renderDailyPage(ctx:AppContext,date:string,data:{tasks:Row[];items:Row[]},tomorrow:boolean):string {
  const csrf=ctx.session.csrfToken ?? '';
  const rows=data.tasks.map(t=>`<div class="row"><label style="display:flex;gap:10px;align-items:center"><input class="check toggle" type="checkbox" data-type="task" data-id="${esc(t.id)}" ${t.status==='completed'?'checked':''}><span class="${t.status==='completed'?'done':''}">${Number(t.id)<0?`<span>${esc(t.title)} <small>(定期)</small></span>`:`<a href="/task/view.php?id=${t.id}">${esc(t.title)}</a>`}</span></label><div class="meta">${esc(t.assignees||'')}${t.start_at?' ・ '+esc(String(t.start_at).slice(11,16)):t.due_at?' ・ '+(String(t.due_at).slice(11,16)==='00:00'?'終日':esc(String(t.due_at).slice(11,16))):''}${t.location?' ・ '+esc(t.location):''}</div></div>`).join('');
  const items=data.items.map(i=>`<div class="row"><label style="display:flex;gap:10px;align-items:center"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(i.id)}" ${i.status==='completed'?'checked':''}><span class="${i.status==='completed'?'done':''}"><a href="/item/edit.php?id=${i.id}">${esc(i.name)}</a></span></label>${i.event_title?`<div class="meta">📅 ${esc(i.event_title)}</div>`:''}</div>`).join('');
  return layout(tomorrow?'明日の準備':'今日',`<div class="page-head"><h1>${tomorrow?'🌙 明日の準備':'☀️ 今日'}</h1><div class="meta">${esc(date)} ・ ${esc(ctx.member?.name)}</div></div><div class="card"><h2>📝 タスク</h2>${rows||'<p>対象日のタスクはありません。</p>'}<a class="btn" href="/task/new.php?date=${date}">＋ タスクを追加</a></div><div class="card"><h2>🎒 持ち物</h2>${items||'<p>対象日の持ち物はありません。</p>'}<a class="btn" href="/item/new.php?date=${date}">＋ 持ち物を追加</a></div><script>window.FAMILY_CSRF=${JSON.stringify(csrf)};document.querySelectorAll('.toggle').forEach(el=>el.addEventListener('change',async()=>{const checked=el.checked;const p=el.parentElement;const label=p.querySelector('span');el.disabled=true;try{const r=await fetch('/api/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:el.dataset.type,id:Number(el.dataset.id),completed:checked,csrf:window.FAMILY_CSRF})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'更新に失敗しました');label?.classList.toggle('done',checked);}catch(e){el.checked=!checked;alert(e.message);}finally{el.disabled=false;}}));</script>`,tomorrow?'/tomorrow.php':'/today.php');
}

export async function toggle(request:Request,ctx:AppContext):Promise<Response>{const m=requireMember(ctx);const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const type=String(b.type??'');const id=Number(b.id??0);const completed=Boolean(b.completed);if(!['task','item','shopping','recurrence'].includes(type)||!id)throw new BadRequest('対象が不正です。');
  if(type==='recurrence'){const occId=Number(b.occurrence_id||id);const occ=await ctx.env.DB.prepare('SELECT o.id,o.family_id FROM recurrence_occurrences o WHERE o.id=? AND o.family_id=?').bind(occId,m.family_id).first<Row>();if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);const now=nowJst();await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(completed?'completed':'pending',completed?m.id:null,completed?now:null,now,occId,m.family_id).run();return commitSession(json({ok:true,status:completed?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);}const tables={task:['tasks','task_id','task_completion_history'],item:['items','item_id','item_completion_history'],shopping:['shopping_items','shopping_item_id','shopping_completion_history']} as const;const [table,hid,hist]=tables[type as keyof typeof tables];const current=await ctx.env.DB.prepare(`SELECT id,status FROM ${table} WHERE id=? AND family_id=? LIMIT 1`).bind(id,m.family_id).first<Row>();if(!current) return json({ok:false,error:'対象が見つかりません。'},404);const now=nowJst();const newStatus=completed?'completed':'pending';await ctx.env.DB.batch([ctx.env.DB.prepare(`UPDATE ${table} SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?`).bind(newStatus,completed?m.id:null,completed?now:null,now,id,m.family_id),ctx.env.DB.prepare(`INSERT INTO ${hist}(${hid},member_id,action,occurred_at) VALUES(?,?,?,?)`).bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now)]);return commitSession(json({ok:true,status:newStatus}),ctx.session,ctx.env.APP_SECRET);}

export async function calendar(request:Request,ctx:AppContext,month:string):Promise<Response>{requireMember(ctx);const m=/^\d{4}-\d{2}$/.test(month)?month:dateOnly().slice(0,7);const [y,mo]=m.split('-').map(Number);const first=new Date(Date.UTC(y,mo-1,1));const start=new Date(first);start.setUTCDate(1-first.getUTCDay());const end=new Date(Date.UTC(y,mo,0));end.setUTCDate(end.getUTCDate()+(6-end.getUTCDay()));const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10);const tasks=await ctx.env.DB.prepare(`SELECT t.*,GROUP_CONCAT(m.name,'、') assignees FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members m ON m.id=ta.member_id WHERE t.family_id=? AND t.calendar_visible=1 AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?))) OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at) BETWEEN date(?) AND date(?))) GROUP BY t.id ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(ctx.member!.family_id,to,from,from,to).all<Row>();const events=await ctx.env.DB.prepare('SELECT * FROM events WHERE family_id=? AND ((start_at IS NOT NULL AND date(start_at)<=date(?) AND (end_at IS NULL OR date(end_at)>=date(?))) OR (start_at IS NULL AND date(start_at) BETWEEN date(?) AND date(?))) ORDER BY coalesce(start_at,end_at),id').bind(ctx.member!.family_id,to,from,from,to).all<Row>();const recurRows:Row[]=[]; for(let d=new Date(`${from}T12:00:00Z`);d<=new Date(`${to}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){ const ds=d.toISOString().slice(0,10); recurRows.push(...await recurringForDate(ctx,ds)); } return html(renderCalendarPage(ctx,m,start,end,[...tasks.results,...recurRows],events.results));}

function renderCalendarPage(ctx:AppContext,month:string,start:Date,end:Date,tasks:Row[],events:Row[]):string{const map:Record<string,Row[]>=Object.create(null);for(const t of ([...tasks,...events.map(e=>({...e,_event:true}))] as Row[])){const s=String(t.start_at||t.due_at||'').slice(0,10);const e=String(t.end_at||s).slice(0,10);if(!s)continue;let d=new Date(`${s}T12:00:00Z`),last=new Date(`${e}T12:00:00Z`);if(last<d)last=d;for(;d<=last;d.setUTCDate(d.getUTCDate()+1)){const k=d.toISOString().slice(0,10);(map[k]??=[]).push(t)}}let cells='';const cursor=new Date(start);for(;cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1)){const d=cursor.toISOString().slice(0,10),inMonth=d.startsWith(month),items=map[d]||[];cells+=`<button class="calendar-cell ${inMonth?'':'other'}" data-date="${d}"><div class="num">${Number(d.slice(8))}</div><div class="calendar-items">${items.slice(0,4).map(t=>`<div class="calendar-item ${t._event?'event':''}">${esc(t.title)}</div>`).join('')}${items.length>4?`<div class="meta">+${items.length-4}件</div>`:''}</div></button>`}const prev=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-2,1)).toISOString().slice(0,7),next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,7);return layout('カレンダー',`<div class="page-head calendar-page-head"><div><h1>📅 カレンダー</h1><div class="meta">${month}</div></div><div><a class="btn gray" href="/app/calendar.php?month=${prev}">‹</a> <a class="btn gray" href="/app/calendar.php?month=${next}">›</a></div></div><div class="card"><div class="calendar-grid"><div class="weekday"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>${cells}</div></div><div class="card" id="dayDetail"><h2>日付を選択</h2><p>日付をタップすると予定の詳細を表示します。新規追加もここから行えます。</p></div><script>const detail=${JSON.stringify(Object.fromEntries(Object.entries(map).map(([k,v])=>[k,v.map(t=>({id:t.id,title:t.title,start_at:t.start_at,end_at:t.end_at,due_at:t.due_at,location:t.location,description:t.description,event:!!t._event,recurring:Number(t.id)<0}))])))};document.querySelectorAll('.calendar-cell').forEach(b=>b.addEventListener('click',()=>{const d=b.dataset.date,x=detail[d]||[],box=document.getElementById('dayDetail');box.innerHTML='<h2>'+d+'の予定</h2>'+ (x.length?x.map(t=>'<div class="row"><strong>'+(t.event||t.recurring?esc(t.title)+(t.recurring?' <small>(定期)</small>':''):'<a href="/task/view.php?id='+t.id+'">'+esc(t.title)+'</a>')+'</strong><div class="meta">'+esc(t.start_at?String(t.start_at).slice(11,16):t.due_at?String(t.due_at).slice(11,16)==='00:00'?'終日':String(t.due_at).slice(11,16):'')+'</div><div class="meta">'+esc(t.location||'')+'</div></div>').join(''):'<p>予定はありません。</p>')+'<p><a class="btn" href="/task/new.php?date='+d+'&return=calendar">＋ この日にタスクを追加</a> <a class="btn secondary" href="/calendar/event/new?date='+d+'">＋ 予定を追加</a></p>';}));</script>`, '/app/calendar.php');}


export async function eventApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await bodyJson(request); await ensureCsrf(ctx,b.csrf);
  const title=String(b.title??'').trim(); const date=String(b.date??'').trim();
  if(!title||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new BadRequest('タイトルと日付を入力してください。');
  const st=String(b.start_time??'').trim(); const et=String(b.end_time??'').trim();
  const start=st?`${date} ${st}:00`:`${date} 00:00:00`; const end=et?`${date} ${et}:00`:null; const now=nowJst();
  const r=await ctx.env.DB.prepare('INSERT INTO events(family_id,title,start_at,end_at,location,memo,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,title,start,end,String(b.location??'')||null,String(b.memo??'')||null,m.id,now,now).run();
  const id=Number(r.meta.last_row_id);
  return json({ok:true,id},201);
}

export async function eventNew(ctx:AppContext,date:string):Promise<Response>{
  requireMember(ctx);
  return html(layout('予定を追加',`<div class="card"><h1>📅 予定を追加</h1><form id="eventForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken??'')}"><label>タイトル</label><input name="title" required><label>日付</label><input type="date" name="date" value="${esc(date)}" required><label>開始時刻</label><input type="time" name="start_time"><label>終了時刻</label><input type="time" name="end_time"><label>場所</label><input name="location"><label>メモ</label><textarea name="memo"></textarea><button>登録する</button></form></div><script>document.getElementById('eventForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/app/calendar.php?month='+String(b.date).slice(0,7);else alert(d.error||'登録に失敗しました。');};</script>`,'/app/calendar.php'));
}

export async function messages(request:Request,ctx:AppContext):Promise<Response>{const m=requireMember(ctx);if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const text=String(b.text??'').trim();const target=Number(b.target_member_id??0)||null;if(!text)throw new BadRequest('伝言を入力してください。');const now=nowJst();await ctx.env.DB.prepare('INSERT INTO messages(family_id,sender_id,target_member_id,text,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(m.family_id,m.id,target,text,now,now).run();return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);}const rows=await ctx.env.DB.prepare('SELECT msg.*,s.name sender_name,r.name recipient_name FROM messages msg LEFT JOIN members s ON s.id=msg.sender_id LEFT JOIN members r ON r.id=msg.target_member_id WHERE msg.family_id=? ORDER BY msg.created_at DESC,msg.id DESC LIMIT 100').bind(m.family_id).all<Row>();const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();return html(layout('伝言',`<div class="page-head"><h1>💬 伝言</h1></div><div class="card"><h2>伝言一覧</h2>${rows.results.map(r=>`<div class="row"><div>${esc(r.text)}</div><div class="meta">${esc(r.sender_name||'')} → ${esc(r.recipient_name||'全員')} ・ ${esc(r.created_at||'')}</div></div>`).join('')||'<p>伝言はありません。</p>'}</div><div class="card"><form id="msgForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken??'')}"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map((r:Row)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" required></textarea><button type="submit">投稿する</button></form></div><script>document.getElementById('msgForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'投稿できませんでした。');}</script>`, '/app/messages.php'));}

export async function shopping(request:Request,ctx:AppContext):Promise<Response>{const m=requireMember(ctx);if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action??'add');if(action==='toggle'){const id=Number(b.id);const completed=Boolean(b.completed);const now=nowJst();await ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(completed?'completed':'pending',completed?m.id:null,completed?now:null,now,id,m.family_id).run();return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);}if(action==='add'){const name=String(b.name??'').trim();if(!name)throw new BadRequest('商品名を入力してください。');const now=nowJst();await ctx.env.DB.prepare('INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,"pending",?,?,?)').bind(m.family_id,name,String(b.quantity??'1'),String(b.category??'')||null,String(b.memo??'')||null,String(b.due_date??'')||null,m.id,now,now).run();return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);}}const rows=await ctx.env.DB.prepare('SELECT * FROM shopping_items WHERE family_id=? ORDER BY status,category,name,id').bind(m.family_id).all<Row>();return html(layout('買い物',`<div class="page-head"><h1>🛒 買い物</h1></div><div class="card"><div id="shoppingList">${rows.results.map(r=>`<div class="row" style="display:flex;gap:8px;align-items:center"><input class="shop-toggle" type="checkbox" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span class="${r.status==='completed'?'done':''}" style="flex:1"><a href="/app/shopping_edit.php?id=${r.id}">${esc(r.name)}</a>${r.quantity&&r.quantity!=='1'?` × ${esc(r.quantity)}`:''}</span></div>`).join('')||'<p>買い物はありません。</p>'}</div></div><div class="card"><form id="shopForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken??'')}"><label>商品名</label><input name="name" required><label>数量</label><input name="quantity" type="number" min="1" value="1"><label>カテゴリー</label><input name="category"><button type="submit">追加する</button></form></div><script>document.querySelectorAll('.shop-toggle').forEach(e=>e.onchange=async()=>{const r=await fetch('/api/shopping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'toggle',id:Number(e.dataset.id),completed:e.checked,csrf:${JSON.stringify(ctx.session.csrfToken??'')}})});if(r.ok)location.reload();else e.checked=!e.checked;});document.getElementById('shopForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/shopping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'add',...b})});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'追加に失敗しました。');}</script>`, '/app/shopping.php'));}

export async function home(ctx:AppContext):Promise<Response>{const m=ctx.member;if(!m)return redirect('/login.php');const family=await ctx.env.DB.prepare('SELECT * FROM families WHERE id=? LIMIT 1').bind(m.family_id).first<Row>();const today=dateOnly();const counts=await Promise.all([ctx.env.DB.prepare("SELECT count(*) c FROM tasks WHERE family_id=? AND status='pending' AND date(coalesce(start_at,due_at))=date(?)").bind(m.family_id,today).first<Row>(),ctx.env.DB.prepare("SELECT count(*) c FROM shopping_items WHERE family_id=? AND status='pending'").bind(m.family_id).first<Row>(),ctx.env.DB.prepare("SELECT count(*) c FROM messages WHERE family_id=?").bind(m.family_id).first<Row>()]);const c=(i:number)=>Number(((counts[i] as any)?.c)??0);return html(layout('Family TODO LINE',`<div class="page-head"><h1>🏠 Family TODO LINE</h1><div class="meta">${esc(family?.name||'家族')} ・ ${esc(m.name)}</div></div><div class="menu" style="margin-top:18px"><a class="today" href="/today.php">☀️ 今日 <small>${c(0)}件</small></a><a class="tomorrow" href="/tomorrow.php">🌙 明日の準備</a><a class="calendar" href="/app/calendar.php">📅 カレンダー</a><a class="shopping" href="/app/shopping.php">🛒 買い物 <small>${c(1)}件</small></a><a class="message" href="/app/messages.php">💬 伝言 <small>${c(2)}件</small></a><a class="settings" href="/app/settings.php">⚙️ 管理</a></div>`,''));}

export async function createFamilyPage(ctx:AppContext):Promise<Response>{return html(layout('家族を作成',`<div class="card"><h1>家族を作成</h1><p class="meta">LINEアカウント：${esc(ctx.session.lineDisplayName||'')}</p><form id="familyCreate"><label>家族名</label><input name="family_name" maxlength="255" required placeholder="例：田中家"><label>あなたの名前</label><input name="member_name" maxlength="255" value="${esc(ctx.session.lineDisplayName||'')}" required><button>家族を作成する</button></form><hr><p>既存の家族に参加する場合は家族コードを入力してください。</p><form id="familyJoin"><label>家族コード</label><input name="family_code" maxlength="32" required><label>あなたの名前</label><input name="member_name" value="${esc(ctx.session.lineDisplayName||'')}" required><button type="submit">家族に参加する</button></form></div><script>const run=async(id,url)=>{document.getElementById(id).onsubmit=async e=>{e.preventDefault();const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});const d=await r.json();if(d.ok)location.href=d.redirect;else alert(d.error||'処理に失敗しました。');}};run('familyCreate','/api/family/create');run('familyJoin','/api/family/join');</script>`));}

export async function apiMe(ctx:AppContext):Promise<Response>{if(!ctx.member)return json({ok:true,authenticated:false});const family=await ctx.env.DB.prepare('SELECT id,name,family_code FROM families WHERE id=?').bind(ctx.member.family_id).first<Row>();return json({ok:true,authenticated:true,member:ctx.member,family});}


export async function taskView(ctx:AppContext, id:number):Promise<Response>{
  const m=requireMember(ctx); if(!Number.isInteger(id)||id<=0) return new Response('Not Found',{status:404});
  const task=await ctx.env.DB.prepare(`SELECT t.*, COALESCE(GROUP_CONCAT(m.name,'、'),'') assignees,
    (SELECT e.title FROM events e WHERE e.id=t.event_id) event_title,
    c.name completer_name, cr.name creator_name
    FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members m ON m.id=ta.member_id
    LEFT JOIN members c ON c.id=t.completed_by LEFT JOIN members cr ON cr.id=t.created_by
    WHERE t.id=? AND t.family_id=? GROUP BY t.id LIMIT 1`).bind(id,m.family_id).first<Row>();
  if(!task) return new Response('タスクが見つかりません。',{status:404});
  const history=await ctx.env.DB.prepare(`SELECT h.*,m.name member_name FROM task_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.task_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30`).bind(id).all<Row>();
  const role=String(m.role||'').toUpperCase(); const canEdit=role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id;
  const body=`<div class="card"><h1>📝 タスク詳細</h1><h2>${esc(task.title)}</h2>
  <div class="meta">${esc(task.start_at||task.due_at||'')}${task.end_at?' ～ '+esc(task.end_at):''}${task.location?' ・ '+esc(task.location):''}</div>
  ${task.assignees?`<p>担当：${esc(task.assignees)}</p>`:''}${task.description?`<div class="card"><div>${esc(task.description).replaceAll('\n','<br>')}</div></div>`:''}
  <p>状態：<strong>${task.status==='completed'?'完了':'未完了'}</strong>${task.completer_name?' ・ 完了者：'+esc(task.completer_name):''}</p>
  <p><input type="checkbox" id="done" ${task.status==='completed'?'checked':''}> 完了</p>
  ${canEdit?`<p><a class="btn" href="/task/edit.php?id=${id}">編集</a> <button class="btn danger" id="del">削除</button></p>`:''}
  <p><a class="btn gray" href="/today.php">戻る</a></p></div>
  <div class="card"><h2>完了履歴</h2>${history.results.map(h=>`<div class="row">${esc(h.action)} ・ ${esc(h.member_name||'')} ・ ${esc(h.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div>
  <script>const csrf=${JSON.stringify(ctx.session.csrfToken||'')};document.getElementById('done').onchange=async e=>{const r=await fetch('/api/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'task',id:${id},completed:e.target.checked,csrf})});if(!r.ok){e.target.checked=!e.target.checked;alert('更新に失敗しました。')}};${canEdit?`document.getElementById('del').onclick=async()=>{if(!confirm('このタスクを削除しますか？'))return;const r=await fetch('/api/task?id=${id}',{method:'DELETE',headers:{'x-csrf':csrf}});const d=await r.json();if(d.ok)location.href='/today.php';else alert(d.error||'削除に失敗しました。');};`:''}</script>`;
  return html(layout('タスク詳細',body,''));
}

export async function taskEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx); const task=await ctx.env.DB.prepare('SELECT * FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
  if(!task) return new Response('タスクが見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id)) return new Response('編集権限がありません。',{status:403});
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const current=await ctx.env.DB.prepare('SELECT member_id FROM task_assignees WHERE task_id=?').bind(id).all<Row>(); const selected=new Set(current.results.map(x=>Number(x.member_id)));
  if(request.method==='POST'){
    const b=await bodyJson(request); await ensureCsrf(ctx,b.csrf); const title=String(b.title||'').trim(); const date=String(b.date||'').trim();
    if(!title||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new BadRequest('タイトルと日付を入力してください。');
    const st=String(b.start_time||'').trim(), et=String(b.end_time||'').trim(); const start=st?`${date} ${st}:00`:null; const end=et?`${date} ${et}:00`:null; const now=nowJst();
    await ctx.env.DB.prepare('UPDATE tasks SET title=?,description=?,due_at=?,start_at=?,end_at=?,location=?,updated_at=? WHERE id=? AND family_id=?').bind(title,String(b.description||'')||null,end||start||`${date} 00:00:00`,start,end,String(b.location||'')||null,now,id,m.family_id).run();
    await ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id).run();
    const ids=Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
    if(ids.length) await ctx.env.DB.batch(ids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    return redirect(`/task/view.php?id=${id}`);
  }
  const d=String(task.start_at||task.due_at||'').slice(0,10); const st=task.start_at?String(task.start_at).slice(11,16):''; const et=task.end_at?String(task.end_at).slice(11,16):'';
  const body=`<div class="card"><h1>📝 タスク編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>タイトル</label><input name="title" required value="${esc(task.title)}"><label>日付</label><input type="date" name="date" value="${esc(d)}" required><label>開始時刻</label><input type="time" name="start_time" value="${esc(st)}"><label>終了時刻</label><input type="time" name="end_time" value="${esc(et)}"><label>場所</label><input name="location" value="${esc(task.location||'')}"><label>説明</label><textarea name="description">${esc(task.description||'')}</textarea><label>担当者</label>${members.results.map(x=>`<label><input type="checkbox" name="assignees" value="${x.id}" ${selected.has(Number(x.id))?'checked':''}> ${esc(x.name)}</label>`).join('')}<button>保存する</button></form><p><a class="btn gray" href="/task/view.php?id=${id}">戻る</a></p></div>`;
  return html(layout('タスク編集',body,''));
}

export async function taskApiLegacy(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const id=Number(new URL(request.url).searchParams.get('id')||0); if(!id) return json({ok:false,error:'idが不正です。'},400);
  const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>(); if(!task) return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id)) return json({ok:false,error:'権限がありません。'},403);
  if(request.method==='DELETE'){const csrf=request.headers.get('x-csrf'); await ensureCsrf(ctx,csrf); await ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).run(); return json({ok:true});}
  return json({ok:false,error:'Method Not Allowed'},405);
}

export async function itemEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx); const item=await ctx.env.DB.prepare('SELECT * FROM items WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>(); if(!item) return new Response('持ち物が見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id)) return new Response('編集権限がありません。',{status:403});
  const tasks=await ctx.env.DB.prepare(`SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND status<>'completed' ORDER BY coalesce(start_at,due_at),id`).bind(m.family_id).all<Row>();
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'save'); if(action==='delete'){await ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(id,m.family_id).run();return redirect('/today.php');} const name=String(b.name||'').trim();if(!name)throw new BadRequest('持ち物名を入力してください。');const taskId=Number(b.task_id||0)||null;let due: string|null=null;if(taskId){const t=await ctx.env.DB.prepare('SELECT start_at,due_at FROM tasks WHERE id=? AND family_id=?').bind(taskId,m.family_id).first<Row>();if(!t)throw new BadRequest('タスクが見つかりません。');due=String(t.start_at||t.due_at||'').slice(0,10)||null;}else if(String(b.due_mode||'none')==='date'){due=String(b.due_date||'').trim()||null;if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new BadRequest('日付が不正です。');}await ctx.env.DB.prepare('UPDATE items SET name=?,memo=?,due_at=?,task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(name,String(b.memo||'')||null,due,taskId,nowJst(),id,m.family_id).run();return redirect(`/today.php${due?'?date='+encodeURIComponent(due):''}`);}
  const d=String(item.due_at||'').slice(0,10); const body=`<div class="card"><h1>🎒 持ち物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="id" value="${id}"><label>持ち物</label><input name="name" required value="${esc(item.name)}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>関連タスク</label><select name="task_id"><option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}" ${Number(item.task_id)===Number(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}</select><label>日付（タスクを指定しない場合）</label><input type="date" name="due_date" value="${esc(d)}"><button name="action" value="save">保存する</button></form><form method="post" onsubmit="return confirm('この持ち物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;return html(layout('持ち物編集',body,''));
}

export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx); const item=await ctx.env.DB.prepare('SELECT * FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>(); if(!item) return new Response('買い物が見つかりません。',{status:404}); const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id)) return new Response('編集権限がありません。',{status:403});
  const tasks=await ctx.env.DB.prepare(`SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND status<>'completed' ORDER BY coalesce(start_at,due_at),id`).bind(m.family_id).all<Row>();
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'save');if(action==='delete'){await ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id).run();return redirect('/app/shopping.php');}const name=String(b.name||'').trim();if(!name)throw new BadRequest('商品名を入力してください。');const qty=Math.max(1,Number(b.quantity||1));const taskId=Number(b.task_id||0)||null;let due=String(b.due_date||'').trim()||null;if(taskId){const t=await ctx.env.DB.prepare('SELECT start_at,due_at FROM tasks WHERE id=? AND family_id=?').bind(taskId,m.family_id).first<Row>();if(!t)throw new BadRequest('タスクが見つかりません。');due=String(t.start_at||t.due_at||'').slice(0,10)||null;}await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,category=?,memo=?,due_date=?,task_id=?,url=?,updated_at=? WHERE id=? AND family_id=?').bind(name,String(qty),String(b.category||'')||null,String(b.memo||'')||null,due,taskId,String(b.url||'')||null,nowJst(),id,m.family_id).run();return redirect('/app/shopping.php');}
  const body=`<div class="card"><h1>🛒 買い物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>商品名</label><input name="name" required value="${esc(item.name)}"><label>数量</label><input type="number" name="quantity" min="1" value="${esc(item.quantity||'1')}"><label>カテゴリー</label><input name="category" value="${esc(item.category||'')}"><label>URL</label><input type="url" name="url" value="${esc(item.url||'')}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>紐づくタスク</label><select name="task_id"><option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}" ${Number(item.task_id)===Number(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}</select><label>期限日</label><input type="date" name="due_date" value="${esc(item.due_date||'')}"><button name="action" value="save">保存する</button></form><form method="post" onsubmit="return confirm('この買い物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;return html(layout('買い物編集',body,''));
}

export async function settings(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const role=String(m.role||'').toUpperCase(); const isAdmin=role==='OWNER'||role==='ADMIN';
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'');
    if(action==='profile'){const name=String(b.name||'').trim();if(!name)throw new BadRequest('名前を入力してください。');await ctx.env.DB.prepare('UPDATE members SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(name,nowJst(),m.id,m.family_id).run();ctx.member={...m,name};return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);}
    if(action==='member_toggle'||action==='member_delete'){if(!isAdmin) return json({ok:false,error:'管理者権限が必要です。'},403);const target=Number(b.member_id||0);if(target===m.id||!target)return json({ok:false,error:'対象が不正です。'},400);const targetMember=await ctx.env.DB.prepare('SELECT id,role,active FROM members WHERE id=? AND family_id=?').bind(target,m.family_id).first<Row>();if(!targetMember)return json({ok:false,error:'メンバーが見つかりません。'},404);if(String(targetMember.role).toUpperCase()==='OWNER')return json({ok:false,error:'OWNERは変更できません。'},400);if(action==='member_toggle'){await ctx.env.DB.prepare('UPDATE members SET active=?,updated_at=? WHERE id=? AND family_id=?').bind(Number(targetMember.active)?0:1,nowJst(),target,m.family_id).run();return json({ok:true});}await ctx.env.DB.prepare('DELETE FROM members WHERE id=? AND family_id=?').bind(target,m.family_id).run();return json({ok:true});}
    if(action==='notification'){const enabled=b.enabled?1:0;const before=Math.max(0,Number(b.before_day||1));const morning=b.morning?1:0;const oneHour=b.one_hour_before?1:0;await ctx.env.DB.prepare(`INSERT INTO notification_settings(family_id,member_id,enabled,before_day,morning,one_hour_before,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(family_id,member_id) DO UPDATE SET enabled=excluded.enabled,before_day=excluded.before_day,morning=excluded.morning,one_hour_before=excluded.one_hour_before,updated_at=excluded.updated_at`).bind(m.family_id,m.id,enabled,before,morning,oneHour,nowJst(),nowJst()).run();return json({ok:true});}
  }
  const members=await ctx.env.DB.prepare('SELECT id,name,role,active,notification_enabled FROM members WHERE family_id=? ORDER BY id').bind(m.family_id).all<Row>();
  const ns=await ctx.env.DB.prepare('SELECT * FROM notification_settings WHERE family_id=? AND member_id=?').bind(m.family_id,m.id).first<Row>();
  const recurring=await ctx.env.DB.prepare('SELECT id,name AS title,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active FROM recurrence_rules WHERE family_id=? ORDER BY active DESC,id DESC').bind(m.family_id).all<Row>();
  const body=`<div class="card"><h1>⚙️ 管理</h1><h2>プロフィール</h2><form id="profile"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input name="name" value="${esc(m.name)}" required><button>保存</button></form></div><div class="card"><h2>メンバー</h2>${members.results.map(x=>`<div class="row"><strong>${esc(x.name)}</strong> <span class="meta">${esc(x.role)} / ${Number(x.active)?'有効':'停止'}</span>${isAdmin&&Number(x.id)!==m.id&&String(x.role).toUpperCase()!=='OWNER'?` <button class="btn gray member-toggle" data-id="${x.id}">${Number(x.active)?'停止':'再開'}</button> <button class="btn danger member-del" data-id="${x.id}">削除</button>`:''}</div>`).join('')}</div><div class="card"><h2>通知設定</h2><form id="notify"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label><input type="checkbox" name="enabled" ${Number(ns?.enabled??1)?'checked':''}> 通知を有効にする</label><label>何日前 <input type="number" name="before_day" min="0" max="30" value="${esc(ns?.before_day??1)}"></label><label><input type="checkbox" name="morning" ${Number(ns?.morning??1)?'checked':''}> 朝通知</label><label><input type="checkbox" name="one_hour_before" ${Number(ns?.one_hour_before??0)?'checked':''}> 1時間前通知</label><button>保存</button></form></div><div class="card"><h2>家族招待</h2>${isAdmin?'<button id="inviteBtn" class="btn">招待リンクを発行</button><div id="inviteOut" class="meta"></div>':'<p class="meta">招待リンクの発行は管理者のみ可能です。</p>'}</div><div class="card"><h2>定期タスク</h2><p><a class="btn" href="/app/recurring.php">定期タスクを管理</a></p>${recurring.results.map(r=>`<div class="row"><strong>${esc(r.title)}</strong><div class="meta">${esc(r.recurrence_type)} / ${esc(r.interval_value)}</div></div>`).join('')||'<p>登録済みの定期タスクはありません。</p>'}</div><script>const csrf=${JSON.stringify(ctx.session.csrfToken||'')};document.getElementById('profile').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'profile',...b})});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'保存に失敗しました')};document.getElementById('notify').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const r=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'notification',csrf,before_day:Number(f.before_day.value),enabled:f.enabled.checked,morning:f.morning.checked,one_hour_before:f.one_hour_before.checked})});const d=await r.json();if(!d.ok)alert(d.error||'保存に失敗しました')};document.querySelectorAll('.member-toggle,.member-del').forEach(b=>b.onclick=async()=>{if(b.classList.contains('member-del')&&!confirm('このメンバーを削除しますか？'))return;const action=b.classList.contains('member-del')?'member_delete':'member_toggle';const r=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,member_id:Number(b.dataset.id),csrf})});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'処理に失敗しました')});const inviteBtn=document.getElementById('inviteBtn');if(inviteBtn)inviteBtn.onclick=async()=>{const r=await fetch('/api/family/invite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,expires_days:7})});const d=await r.json();if(d.ok){document.getElementById('inviteOut').innerHTML='<p>有効期限: '+d.expires_at+'</p><input readonly style="width:100%" value="'+d.url.replaceAll('&','&amp;')+'" onclick="this.select()">'}else alert(d.error||'発行に失敗しました')};</script>`;
  return html(layout('管理',body,'/app/settings.php'));
}

export async function inviteCreate(request: Request, ctx: AppContext): Promise<Response> {
  const m = requireMember(ctx);
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  const b = await bodyJson(request);
  await ensureCsrf(ctx, b.csrf);
  const role = String(m.role||'').toUpperCase();
  if (role !== 'OWNER' && role !== 'ADMIN') return json({ok:false,error:'管理者権限が必要です。'},403);
  const expiresDays = Math.min(30, Math.max(1, Number(b.expires_days||7)));
  const token = `${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(v=>v.toString(16).padStart(2,'0')).join('');
  const expires = new Date(Date.now()+expiresDays*86400000).toISOString().replace('T',' ').slice(0,19);
  await ctx.env.DB.prepare('INSERT INTO family_invitations(family_id,token_hash,created_by,expires_at,created_at) VALUES(?,?,?,?,?)').bind(m.family_id,tokenHash,m.id,expires,nowJst()).run();
  const base = (ctx.env.APP_URL || new URL(ctx.request.url).origin).replace(/\/$/,'');
  return json({ok:true,token,expires_at:expires,url:`${base}/family/join.php?token=${encodeURIComponent(token)}`});
}

export async function invitePage(ctx: AppContext, token: string): Promise<Response> {
  const trimmed = token.trim();
  if (!trimmed) return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>招待情報がありません。</p></div>'));
  return html(layout('家族に参加',`<div class="card"><h1>家族に参加</h1><p>この招待リンクから家族に参加できます。</p><form id="join"><input type="hidden" name="token" value="${esc(trimmed)}"><label>あなたの名前</label><input name="member_name" value="${esc(ctx.session.lineDisplayName||'')}" required><button>家族に参加する</button></form></div><script>document.getElementById('join').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/family/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href=d.redirect;else alert(d.error||'参加できませんでした。')}</script>`));
}

export async function recurring(request: Request, ctx: AppContext): Promise<Response> {
  const m = requireMember(ctx);
  const role = String(m.role || '').toUpperCase();
  const isAdmin = role === 'OWNER' || role === 'ADMIN';
  if (!isAdmin) return request.method === 'GET'
    ? html(layout('定期タスク', '<div class="card"><h1>🔁 定期タスク</h1><p>定期タスクの管理には管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>', '/app/settings.php'))
    : json({ok:false,error:'管理者権限が必要です。'},403);

  if (request.method === 'POST') {
    const b = await bodyJson(request);
    await ensureCsrf(ctx, b.csrf);
    const action = String(b.action || 'create');

    if (action === 'toggle') {
      const id = Number(b.id || 0);
      if (!id) throw new BadRequest('対象が不正です。');
      const active = b.active ? 1 : 0;
      const result = await ctx.env.DB.prepare('UPDATE recurrence_rules SET active=?,updated_at=? WHERE id=? AND family_id=?')
        .bind(active, nowJst(), id, m.family_id).run();
      if (!result.meta.changes) return json({ok:false,error:'定期タスクが見つかりません。'},404);
      return commitSession(json({ok:true}), ctx.session, ctx.env.APP_SECRET);
    }

    if (action === 'delete') {
      const id = Number(b.id || 0);
      if (!id) throw new BadRequest('対象が不正です。');
      const rule = await ctx.env.DB.prepare('SELECT id,task_id FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1')
        .bind(id, m.family_id).first<Row>();
      if (!rule) return json({ok:false,error:'定期タスクが見つかりません。'},404);
      const taskId = Number(rule.task_id || 0);
      const statements = [
        ctx.env.DB.prepare('DELETE FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(id,m.family_id)
      ];
      if (taskId) statements.push(ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(taskId,m.family_id));
      await ctx.env.DB.batch(statements);
      return commitSession(json({ok:true}), ctx.session, ctx.env.APP_SECRET);
    }

    if (action === 'update') {
      const id = Number(b.id || 0);
      if (!id) throw new BadRequest('対象が不正です。');
      const rule = await ctx.env.DB.prepare('SELECT id,task_id FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1')
        .bind(id,m.family_id).first<Row>();
      if (!rule) return json({ok:false,error:'定期タスクが見つかりません。'},404);
      const taskId = Number(rule.task_id || 0);
      const title = String(b.title || '').trim();
      const type = String(b.recurrence_type || 'DAILY').trim();
      const startDate = String(b.start_date || '').trim();
      const endDate = String(b.end_date || '').trim();
      const allowed = ['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY'];
      if (!title || title.length > 255) throw new BadRequest('タイトルを入力してください。');
      if (!allowed.includes(type)) throw new BadRequest('繰り返し種類が不正です。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequest('開始日が不正です。');
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
      if (endDate && endDate < startDate) throw new BadRequest('終了日は開始日以降にしてください。');
      const interval = Math.max(1, Math.min(365, Number(b.interval_value || 1)));
      const weekdays = Array.isArray(b.weekdays) ? (b.weekdays as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6) : [];
      const monthdays = Array.isArray(b.monthdays) ? (b.monthdays as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=31) : [];
      const weekNumber = Math.max(1, Math.min(5, Number(b.week_number || 1)));
      const businessOrdinal = Math.max(1, Math.min(23, Number(b.business_day_ordinal || 1)));
      const completionMode = String(b.completion_mode || 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
      const description = String(b.description || '').trim() || null;
      const location = String(b.location || '').trim() || null;
      const startTime = String(b.start_time || '').trim();
      const endTime = String(b.end_time || '').trim();
      const allDay = b.all_day ? 1 : 0;
      const calendarVisible = b.calendar_visible === false || String(b.calendar_visible) === '0' ? 0 : 1;
      const startAt = allDay || !startTime ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
      const endAt = allDay || !endTime ? null : `${startDate} ${endTime}:00`;
      if (startAt && endAt && endAt < startAt) throw new BadRequest('終了時刻は開始時刻以降にしてください。');
      const now = nowJst();
      const statements = [
        ctx.env.DB.prepare(`UPDATE recurrence_rules SET name=?,recurrence_type=?,interval_value=?,weekday=?,monthday=?,start_date=?,end_date=?,week_number=?,business_day_ordinal=?,weekdays_json=?,monthdays_json=?,updated_at=? WHERE id=? AND family_id=?`).bind(title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),now,id,m.family_id),
        ctx.env.DB.prepare(`UPDATE tasks SET title=?,description=?,due_at=?,completion_mode=?,updated_at=?,start_at=?,end_at=?,location=?,calendar_visible=?,all_day=? WHERE id=? AND family_id=?`).bind(title,description,startAt,completionMode,now,startAt,endAt,location,calendarVisible,allDay,taskId,m.family_id)
      ];
      await ctx.env.DB.batch(statements);
      return commitSession(json({ok:true}), ctx.session, ctx.env.APP_SECRET);
    }

    // create
    const title = String(b.title || '').trim();
    const type = String(b.recurrence_type || 'DAILY').trim();
    const startDate = String(b.start_date || '').trim();
    const endDate = String(b.end_date || '').trim();
    const allowed = ['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY'];
    if (!title || title.length > 255) throw new BadRequest('タイトルを入力してください。');
    if (!allowed.includes(type)) throw new BadRequest('繰り返し種類が不正です。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequest('タイトルと開始日を入力してください。');
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
    if (endDate && endDate < startDate) throw new BadRequest('終了日は開始日以降にしてください。');
    const interval = Math.max(1, Math.min(365, Number(b.interval_value || 1)));
    const weekdays = Array.isArray(b.weekdays) ? (b.weekdays as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6) : [];
    const monthdays = Array.isArray(b.monthdays) ? (b.monthdays as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=31) : [];
    const weekNumber = Math.max(1, Math.min(5, Number(b.week_number || 1)));
    const businessOrdinal = Math.max(1, Math.min(23, Number(b.business_day_ordinal || 1)));
    const completionMode = String(b.completion_mode || 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
    const description = String(b.description || '').trim() || null;
    const location = String(b.location || '').trim() || null;
    const startTime = String(b.start_time || '').trim();
    const endTime = String(b.end_time || '').trim();
    const allDay = b.all_day ? 1 : 0;
    const calendarVisible = b.calendar_visible === false || String(b.calendar_visible) === '0' ? 0 : 1;
    const startAt = allDay || !startTime ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
    const endAt = allDay || !endTime ? null : `${startDate} ${endTime}:00`;
    if (endAt && endAt < startAt) throw new BadRequest('終了時刻は開始時刻以降にしてください。');
    const now = nowJst();
    const taskR = await ctx.env.DB.prepare(`INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,0)`)
      .bind(m.family_id,title,description,startAt,'pending',completionMode,m.id,now,now,startAt,endAt,location,allDay,calendarVisible,'RECURRING',null).run();
    const taskId = Number(taskR.meta.last_row_id);
    const ruleR = await ctx.env.DB.prepare(`INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,created_at,updated_at,week_number,business_day_ordinal,weekdays_json,monthdays_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`)
      .bind(m.family_id,taskId,title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,now,now,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays)).run();
    const ruleId = Number(ruleR.meta.last_row_id);
    await ctx.env.DB.prepare('UPDATE tasks SET recurrence_rule=? WHERE id=? AND family_id=?').bind(JSON.stringify({recurrence_rule_id:ruleId}),taskId,m.family_id).run();
    return commitSession(json({ok:true,id:ruleId,task_id:taskId}), ctx.session, ctx.env.APP_SECRET);
  }

  const rows = await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? ORDER BY r.active DESC,r.id DESC`).bind(m.family_id).all<Row>();
  const csrf = esc(ctx.session.csrfToken || '');
  const ruleJson = rows.results.map(r => JSON.stringify({
    id:Number(r.id), title:String(r.title||r.name||''), description:String(r.description||''), recurrence_type:String(r.recurrence_type||'DAILY'), interval_value:Number(r.interval_value||1),
    start_date:String(r.start_date||''), end_date:String(r.end_date||''), weekdays:parseJsonArray(r.weekdays_json), monthdays:parseJsonArray(r.monthdays_json), week_number:Number(r.week_number||1), business_day_ordinal:Number(r.business_day_ordinal||1),
    completion_mode:String(r.completion_mode||'ANY'), location:String(r.location||''), all_day:Number(r.all_day??1)===1, calendar_visible:Number(r.calendar_visible??1)===1,
    start_time:String(r.start_at||'').slice(11,16), end_time:String(r.end_at||'').slice(11,16)
  })).map(x=>x.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
  const rowsHtml = rows.results.map((r,i)=>`<div class="row"><strong>${esc(r.title)}</strong><div class="meta">${esc(r.recurrence_type)} / ${esc(r.interval_value)} ・ ${esc(r.start_date)}${r.end_date?' ～ '+esc(r.end_date):''} ・ ${Number(r.active)?'有効':'停止'}</div><button type="button" class="btn gray rec-edit" data-rule="${ruleJson[i]}">編集</button> <button type="button" class="btn gray rec-toggle" data-id="${r.id}" data-active="${Number(r.active)?1:0}">${Number(r.active)?'停止':'再開'}</button> <button type="button" class="btn danger rec-delete" data-id="${r.id}">削除</button></div>`).join('');
  const body = `<div class="page-head"><h1>🔁 定期タスク</h1><a class="btn" href="/app/settings.php">管理へ戻る</a></div>
  <div class="card"><h2 id="recHeading">定期タスクを作成</h2><form id="recForm"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="create"><input type="hidden" name="id" value=""><label>タイトル</label><input name="title" maxlength="255" required><label>説明</label><textarea name="description"></textarea><label>種類</label><select name="recurrence_type"><option value="DAILY">毎日</option><option value="INTERVAL_DAYS">n日ごと</option><option value="WEEKLY">毎週</option><option value="INTERVAL_WEEKS">n週ごと</option><option value="MONTHLY_DAY">毎月指定日</option><option value="MONTHLY_WEEKDAY">毎月第n曜日</option><option value="MONTHLY_BUSINESS_DAY">毎月第n営業日</option></select><label>間隔</label><input type="number" name="interval_value" value="1" min="1" max="365"><label>開始日</label><input type="date" name="start_date" value="${dateOnly()}" required><label>終了日（任意）</label><input type="date" name="end_date"><label>曜日（週次）</label><div>${['日','月','火','水','木','金','土'].map((x,i)=>`<label style="display:inline-block;margin-right:10px"><input type="checkbox" name="weekdays" value="${i}">${x}</label>`).join('')}</div><label>毎月第n曜日</label><select name="week_number"><option value="1">第1</option><option value="2">第2</option><option value="3">第3</option><option value="4">第4</option><option value="5">第5</option></select><label>毎月指定日</label><input name="monthdays" placeholder="1,15,25"><label>第n営業日</label><input type="number" name="business_day_ordinal" value="1" min="1" max="23"><label>開始時刻</label><input type="time" name="start_time"><label>終了時刻</label><input type="time" name="end_time"><label>場所</label><input name="location"><label><input type="checkbox" name="all_day" checked> 終日</label><label><input type="checkbox" name="calendar_visible" checked> カレンダーに表示</label><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">全員が完了</option></select><div style="display:flex;gap:8px"><button id="recSubmit">定期タスクを作成</button><button type="button" id="recCancel" class="btn gray" style="display:none">編集をキャンセル</button></div></form></div>
  <div class="card"><h2>登録済み</h2>${rowsHtml||'<p>ありません。</p>'}</div>
  <script>
  const f=document.getElementById('recForm'),csrf=${JSON.stringify(ctx.session.csrfToken||'')},heading=document.getElementById('recHeading'),submit=document.getElementById('recSubmit'),cancel=document.getElementById('recCancel');
  const setVal=(name,v)=>{const e=f.elements[name];if(e)e.value=v??''};
  function resetForm(){f.reset();setVal('action','create');setVal('id','');setVal('start_date',${JSON.stringify(dateOnly())});setVal('interval_value',1);setVal('week_number',1);setVal('business_day_ordinal',1);heading.textContent='定期タスクを作成';submit.textContent='定期タスクを作成';cancel.style.display='none';f.querySelectorAll('[name=weekdays]').forEach(x=>x.checked=false);}
  f.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));b.csrf=csrf;b.weekdays=[...f.querySelectorAll('[name=weekdays]:checked')].map(x=>Number(x.value));b.monthdays=String(b.monthdays||'').split(',').map(x=>Number(x.trim())).filter(Boolean);b.all_day=f.all_day.checked;b.calendar_visible=f.calendar_visible.checked;const r=await fetch('/app/recurring.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json().catch(()=>({ok:false,error:'応答を読み取れませんでした'}));if(d.ok)location.reload();else alert(d.error||'保存に失敗しました');};
  document.querySelectorAll('.rec-edit').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.rule);setVal('action','update');setVal('id',d.id);setVal('title',d.title);setVal('description',d.description);setVal('recurrence_type',d.recurrence_type);setVal('interval_value',d.interval_value);setVal('start_date',d.start_date);setVal('end_date',d.end_date);setVal('week_number',d.week_number);setVal('business_day_ordinal',d.business_day_ordinal);setVal('monthdays',d.monthdays.join(','));setVal('start_time',d.start_time);setVal('end_time',d.end_time);setVal('location',d.location);setVal('completion_mode',d.completion_mode);f.all_day.checked=d.all_day;f.calendar_visible.checked=d.calendar_visible;f.querySelectorAll('[name=weekdays]').forEach(x=>x.checked=d.weekdays.includes(Number(x.value)));heading.textContent='定期タスクを編集';submit.textContent='変更を保存';cancel.style.display='inline-block';window.scrollTo({top:0,behavior:'smooth'});});
  cancel.onclick=resetForm;
  document.querySelectorAll('.rec-toggle').forEach(b=>b.onclick=async()=>{const active=b.dataset.active==='1';const r=await fetch('/app/recurring.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'toggle',id:Number(b.dataset.id),active:!active,csrf})});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'更新に失敗しました');});
  document.querySelectorAll('.rec-delete').forEach(b=>b.onclick=async()=>{if(!confirm('この定期タスクを削除しますか？\n過去の発生日記録も削除されます。'))return;const r=await fetch('/app/recurring.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',id:Number(b.dataset.id),csrf})});const d=await r.json();if(d.ok)location.reload();else alert(d.error||'削除に失敗しました');});
  </script>`;
  return html(layout('定期タスク', body, '/app/settings.php'));
}
