import { integrationsHealth, APP_VERSION } from './environment-health';
import { validateLiffNext } from './liff-target';
import { withDb } from './db';
import { commitSession, getSessionCookie, openSession } from './session';
import { verifyLineIdToken } from './line';
import { json, html, redirect } from './response';
import type { CurrentMember, SessionData } from './types';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveTaskChildCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { sendWebPush, webPushConfigured, webPushPublicKey } from './webpush';
import { DEFAULT_FAMILY_TIMEZONE, FAMILY_TIMEZONE_OPTIONS, addWallClockMinutes, familyNow, validateTimezone } from './timezone';

export interface AppContext { request: Request; env: Env; session: SessionData; member: CurrentMember | null; }

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const dateOnly = (d = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);


type LineOfficialAccountInfo = { basic_id:string; display_name:string; add_friend_url:string; recommend_url:string };
async function lineOfficialAccountInfo(env: Env): Promise<LineOfficialAccountInfo | null> {
  const token=String(env.LINE_ACCESS_TOKEN||'').trim();
  if(!token) return null;
  try{
    const r=await fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok) return null;
    const d=await r.json() as {basicId?:string;premiumId?:string;displayName?:string};
    const lineId=String(d.premiumId||d.basicId||'').trim();
    if(!lineId) return null;
    const encoded=encodeURIComponent(lineId);
    return {basic_id:lineId,display_name:String(d.displayName||'Family TODO LINE'),add_friend_url:`https://line.me/R/ti/p/${encoded}`,recommend_url:`https://line.me/R/nv/recommendOA/${encoded}`};
  }catch{return null;}
}

export async function makeContext(request: Request, env: Env): Promise<AppContext> {
  const session = await openSession(getSessionCookie(request), env.APP_SECRET);
  const member = session.memberId ? await memberById(env, session.memberId) : null;
  return { request, env, session, member };
}

export async function memberById(env: Env, id: number): Promise<CurrentMember | null> {
  return (await env.DB.prepare('SELECT m.*,COALESCE(f.timezone,?) family_timezone FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=? AND m.active=1 LIMIT 1').bind(env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE,id).first<CurrentMember>()) ?? null;
}

function requireMember(ctx: AppContext): CurrentMember {
  if (!ctx.member) throw new AuthRequired();
  return ctx.member;
}

export class AuthRequired extends Error {}
export class BadRequest extends Error {}
export class Forbidden extends Error {}

/** Central Wave83 predicate. There is deliberately no OWNER/ADMIN override. */
export function taskVisibilitySql(alias='t'):string {
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('invalid task SQL alias');
  return `(COALESCE(${alias}.visibility_scope,'FAMILY')='FAMILY' OR (${alias}.visibility_scope='PRIVATE' AND ${alias}.private_owner_id=?))`;
}
export function canAccessTask(task:Row|undefined|null,memberId:number):boolean {
  return Boolean(task)&&(String(task!.visibility_scope||'FAMILY')==='FAMILY'||(String(task!.visibility_scope)==='PRIVATE'&&Number(task!.private_owner_id)===memberId));
}
async function accessibleTaskById(ctx:AppContext,id:number,columns='t.*'):Promise<Row|null>{
  const m=requireMember(ctx);
  return await ctx.env.DB.prepare(`SELECT ${columns} FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>()??null;
}
/** SQL predicate for item/shopping rows inheriting their parent task visibility. */
export function taskChildVisibilitySql(childAlias:string):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(childAlias))throw new Error('invalid child SQL alias');
  return `(${childAlias}.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks vt WHERE vt.id=${childAlias}.task_id AND vt.family_id=${childAlias}.family_id AND ${taskVisibilitySql('vt')}))`;
}
/** Activity logs are filtered against the *current* parent visibility. Each of
 * task/item/shopping contributes one member-id placeholder; no role override. */
export function activityLogVisibilitySql(logAlias='a'):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(logAlias))throw new Error('invalid activity log SQL alias');
  return `(${logAlias}.target_type NOT IN ('task','item','shopping')
    OR (${logAlias}.target_type='task' AND NOT EXISTS(SELECT 1 FROM tasks av_t WHERE av_t.id=${logAlias}.target_id AND av_t.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_t')}))
    OR (${logAlias}.target_type='item' AND NOT EXISTS(SELECT 1 FROM items av_i JOIN tasks av_it ON av_it.id=av_i.task_id AND av_it.family_id=av_i.family_id WHERE av_i.id=${logAlias}.target_id AND av_i.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_it')}))
    OR (${logAlias}.target_type='shopping' AND NOT EXISTS(SELECT 1 FROM shopping_items av_s JOIN tasks av_st ON av_st.id=av_s.task_id AND av_st.family_id=av_s.family_id WHERE av_s.id=${logAlias}.target_id AND av_s.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_st')})))`;
}
async function privateParentOwner(ctx:AppContext,taskId:number|null):Promise<number|null>{
  if(!taskId)return null;
  const task=await accessibleTaskById(ctx,taskId,'t.visibility_scope,t.private_owner_id');
  if(!task)throw new BadRequest('関連タスクが見つかりません。');
  return String(task.visibility_scope)==='PRIVATE'?Number(task.private_owner_id):null;
}
async function forcePrivateChildAssignee(ctx:AppContext,type:'item'|'shopping',childId:number,ownerId:number|null):Promise<void>{
  if(!ownerId)return;
  const table=type==='item'?'item_assignees':'shopping_assignees',key=type==='item'?'item_id':'shopping_item_id';
  await ctx.env.DB.batch([ctx.env.DB.prepare(`DELETE FROM ${table} WHERE ${key}=?`).bind(childId),ctx.env.DB.prepare(`INSERT INTO ${table}(${key},member_id) VALUES(?,?)`).bind(childId,ownerId)]);
}
const privateTaskRequested=(b:Record<string,unknown>)=>familyLogTruthy(b.visibility_scope==='PRIVATE'||b.is_private,false);

async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const value = await request.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('JSONが不正です。');
    return value as Record<string, unknown>;
  }
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const fd = await request.formData().catch(() => null);
    if (!fd) throw new BadRequest('フォームデータが不正です。');
    const out: Record<string, unknown> = {};
    fd.forEach((value, key) => {
      const v = typeof value === 'string' ? value : value.name;
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        const prev = out[key];
        out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else out[key] = v;
    });
    return out;
  }
  const value = await request.text().catch(() => '');
  if (!value) return {};
  const params = new URLSearchParams(value);
  const out: Record<string, unknown> = {};
  params.forEach((v, key) => { if (Object.prototype.hasOwnProperty.call(out, key)) { const prev=out[key]; out[key]=Array.isArray(prev)?[...prev,v]:[prev,v]; } else out[key]=v; });
  return out;
}

async function ensureCsrf(ctx: AppContext, token: unknown) {
  if (!ctx.session.csrfToken) {
    ctx.session.csrfToken = crypto.randomUUID();
  }
  if (typeof token !== 'string' || token !== ctx.session.csrfToken) throw new Forbidden('CSRF検証に失敗しました。');
}

export function layout(title: string, body: string, active = ''): string {
  const navItems = [
    ['/app/tasks.php','✅','タスク・イベント'],['/app/calendar.php','📅','カレンダー'],['/app/shopping.php','🛒','買い物'],['/app/family_log.php','🐣','家族ログ'],['/app/messages.php','💬','伝言'],['/app/settings.php','⚙️','管理']
  ];
  const nav = `<nav class="bottom-nav"><div class="nav-inner" style="--nav-count:${navItems.length}">${navItems.map(([href,icon,label])=>`<a class="${active===href?'active':''}" href="${href}"><span>${icon}</span>${label}</a>`).join('')}</div></nav>`;
  const extra=active==='/app/calendar.php'?'<link rel="stylesheet" href="/assets/calendar.css?v=12.137.0-wave118">':'';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="theme-color" content="#4f46e5"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>${esc(title)} - Family TODO LINE</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="icon" href="/assets/pwa-192.png"><link rel="stylesheet" href="/assets/family.css?v=12.137.0-wave118">${extra}</head><body><div class="wrap">${body}</div>${nav}<script src="/assets/pwa.js?v=12.97-wave78"></script></body></html>`;
}


/**
 * LIFF専用の入口。LIFF Endpoint URLをこのURLにすると、
 * LINEアプリ内から起動→ID Token検証→Workerセッション発行→アプリ画面
 * までを一つの導線で処理する。
 */
export function liffEntryPage(env: Env, options: {next?: string; loginRedirect?: string} = {}): Response {
  const safeNext = validateLiffNext(options.next) || '/app/index.php';
  const loginRedirect = /^\/liff(?:\?[^\r\n\\]*)?$/.test(options.loginRedirect || '') ? options.loginRedirect : '/liff';
  const payload=JSON.stringify({liffId:String(env.LINE_LIFF_ID||''),next:safeNext,loginRedirect}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body = `<div class="card liff-entry"><h1>Family TODO LINE</h1><p id="status" class="meta">LINE認証を準備しています…</p><div id="error" class="error" style="display:none"></div><button id="retry" style="display:none" class="btn" type="button">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script type="application/json" id="liffAuthPayload">${payload}</script><script src="/assets/liff-auth.js?v=12.136.1-wave117-hotfix"></script>`;
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

export function loginPage(env: Env, nextPath = '/app/index.php'): Response {
  const safeNext=validateLiffNext(nextPath)||'/app/index.php';
  const payload=JSON.stringify({liffId:String(env.LINE_LIFF_ID||''),next:safeNext,loginRedirect:`/liff?next=${encodeURIComponent(safeNext)}`}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body = `<div class="card liff-entry"><h1>Family TODO LINE</h1><p>LINE認証を開始します。</p><p id="status" class="meta">認証を準備しています…</p><div id="error" class="error" style="display:none"></div><button id="retry" style="display:none" class="btn" type="button">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script type="application/json" id="liffAuthPayload">${payload}</script><script src="/assets/liff-auth.js?v=12.136.1-wave117-hotfix"></script>`;
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
  const requestedNext = validateLiffNext(body.next);
  const response = json({ok:true,redirect:member?(requestedNext || '/app/index.php'):'/family/create.php'});
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
  const familyInsert = await ctx.env.DB.prepare('INSERT INTO families(family_code,name,created_at,updated_at) VALUES(?,?,?,?)').bind(familyCode,familyName,now,now).run();
  const familyId = Number(familyInsert.meta.last_row_id ?? 0);
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
  const body = await bodyJson(request);
  const token = String(body.token ?? '').trim();
  const code = String(body.family_code ?? '').trim().toUpperCase();
  const name=String(body.member_name??ctx.session.lineDisplayName??'').trim()||'メンバー';
  if(name.length>255)return json({ok:false,error:'名前は255文字以内で入力してください。'},400);
  if(!token && !code) return json({ok:false,error:'家族コードまたは招待情報を入力してください。'},400);
  let family: ({id:number;name:string}&Row)|null = null;
  let invitationId=0,promotionSubjectId=0;
  if(token){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
    family=await ctx.env.DB.prepare('SELECT f.id,f.name,i.id invitation_id,COALESCE(i.family_log_subject_id,0) family_log_subject_id FROM family_invitations i JOIN families f ON f.id=i.family_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>=? LIMIT 1').bind(hash,nowJst()).first<({id:number;name:string}&Row)>();
    if(!family) return json({ok:false,error:'招待リンクが無効・使用済み・期限切れのいずれかです。'},404);
    invitationId=Number(family.invitation_id||0);promotionSubjectId=Number(family.family_log_subject_id||0);
  } else {
    family=await ctx.env.DB.prepare('SELECT id,name FROM families WHERE family_code=? LIMIT 1').bind(code).first<{id:number;name:string}>();
    if(!family) return json({ok:false,error:'家族コードが見つかりません。'},404);
  }

  // Promotion invitations are validated before creating/reactivating a member so a stale
  // subject link cannot leave a half-created family member behind.
  let promotionSubject:Row|undefined;
  if(promotionSubjectId){
    promotionSubject=await ctx.env.DB.prepare('SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(promotionSubjectId,family.id).first<Row>()||undefined;
    if(!promotionSubject)return json({ok:false,error:'本登録対象の家族ログプロフィールが見つかりません。'},404);
    if(!['BABY','CHILD','ADULT'].includes(familyLogSubjectKind(promotionSubject.subject_kind)))return json({ok:false,error:'この家族ログ対象はLINE本登録できない種類です。'},400);
    const linkedMemberId=Number(promotionSubject.member_id||0);
    if(linkedMemberId){
      const linked=await ctx.env.DB.prepare('SELECT id,line_user_id,deleted_at FROM members WHERE id=? AND family_id=? LIMIT 1').bind(linkedMemberId,family.id).first<Row>();
      if(!linked||linked.deleted_at)return json({ok:false,error:'本登録対象に紐づく家族メンバーが無効です。管理者に確認してください。'},409);
      if(String(linked.line_user_id||'')!==String(ctx.session.lineUserId||''))return json({ok:false,error:'この家族ログ対象はすでに別のLINE家族メンバーへ本登録済みです。'},409);
    }
  }

  const now=nowJst();
  const existing=await ctx.env.DB.prepare('SELECT id,deleted_at FROM members WHERE family_id=? AND line_user_id=? LIMIT 1').bind(family.id,ctx.session.lineUserId).first<Row>();
  let memberId=Number(existing?.id||0)||0;
  if(existing?.deleted_at) return json({ok:false,error:'この家族では削除済みのメンバーです。管理者に再招待を依頼してください。'},409);

  if(memberId&&promotionSubjectId&&Number(promotionSubject?.member_id||0)===0){
    const otherProfile=await ctx.env.DB.prepare('SELECT id,name FROM family_log_subjects WHERE family_id=? AND member_id=? AND id<>? LIMIT 1').bind(family.id,memberId,promotionSubjectId).first<Row>();
    if(otherProfile)return json({ok:false,error:`このLINEアカウントはすでに家族メンバー「${String(otherProfile.name||name)}」として登録されています。既存プロフィールとの自動統合は行わず、管理者側で確認してください。`},409);
  }

  const promotedMemberType=promotionSubject&&['BABY','CHILD'].includes(familyLogSubjectKind(promotionSubject.subject_kind))?'CHILD':'ADULT';
  if(memberId){
    await ctx.env.DB.prepare('UPDATE members SET name=?,active=1,member_type=CASE WHEN ?<>\'\' THEN ? ELSE member_type END,updated_at=? WHERE id=? AND family_id=?')
      .bind(name,promotionSubject?promotedMemberType:'',promotionSubject?promotedMemberType:'',now,memberId,family.id).run();
  } else {
    const r=await ctx.env.DB.prepare('INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(family.id,ctx.session.lineUserId,name,promotionSubject?promotedMemberType:'ADULT','MEMBER',1,1,now,now).run();
    memberId=Number(r.meta.last_row_id||0);
    if(!memberId)throw new Error('家族メンバーIDを取得できませんでした。');
  }

  const finishStatements:any[]=[];
  if(promotionSubjectId){
    finishStatements.push(
      ctx.env.DB.prepare('UPDATE family_log_subjects SET member_id=?,name=?,updated_at=? WHERE id=? AND family_id=? AND active=1 AND (member_id IS NULL OR member_id=?)').bind(memberId,name,now,promotionSubjectId,family.id,memberId),
      ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(family.id,memberId,'PROMOTED','family_log_subject',promotionSubjectId,JSON.stringify({invitation_id:invitationId,member_id:memberId,subject_kind:familyLogSubjectKind(promotionSubject?.subject_kind),source:'family_log_promotion'}),now)
    );
  }
  if(invitationId)finishStatements.push(
    ctx.env.DB.prepare('UPDATE family_invitations SET used_at=?,used_by=? WHERE id=? AND family_id=? AND used_at IS NULL').bind(now,memberId,invitationId,family.id)
  );
  if(finishStatements.length)await ctx.env.DB.batch(finishStatements);

  ctx.session.memberId=memberId;ctx.session.familyId=family.id;
  return commitSession(json({ok:true,redirect:'/app/index.php',family_id:family.id,promoted_subject_id:promotionSubjectId||null}),ctx.session,ctx.env.APP_SECRET);
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
  if(type==='MONTHLY_WEEKDAY') { const w=parseJsonArray(rule.weekdays_json); const weeks=Math.floor((d.getUTCDate()-1)/7)+1; const weekList=parseJsonArray(rule.week_numbers_json); const wants=weekList.length?weekList:[Number(rule.week_number||1)]; return ((d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth())%interval===0&&(w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd)&&wants.includes(weeks); }
  if(type==='MONTHLY_BUSINESS_DAY') { const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth(); if(months<0||months%interval!==0)return false; let n=0; for(let day=1;day<=d.getUTCDate();day++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),day));const key=x.toISOString().slice(0,10);const dayOf=x.getUTCDay();if(dayOf>=1&&dayOf<=5&&jpHolidayName(key)===null)n++;} return n===Number(rule.business_day_ordinal||1); }
  if(type==='YEARLY') return (d.getUTCFullYear()-sd.getUTCFullYear())%interval===0&&d.getUTCMonth()===sd.getUTCMonth()&&d.getUTCDate()===sd.getUTCDate();
  return false;
}
async function recurringForDate(ctx:AppContext,date:string):Promise<Row[]> {
  const rules=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id,(SELECT GROUP_CONCAT(ta.member_id,',') FROM task_assignees ta WHERE ta.task_id=t.id) assignee_ids FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) ORDER BY r.id`).bind(ctx.member!.family_id,date,date).all<Row>();
  const out:Row[]=[];
  for(const r of rules.results){
    if(!matchesRecurrence(r,date)) continue;
    const existing=await ctx.env.DB.prepare('SELECT * FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date=? LIMIT 1').bind(ctx.member!.family_id,r.id,date).first<Row>();
    let occ=existing;
    if(!occ){const now=nowJst();const ins=await ctx.env.DB.prepare('INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(ctx.member!.family_id,r.id,date,'pending',now,now).run();const id=Number(ins.meta.last_row_id);occ={id,status:'pending'};}
    if(String(occ?.status||'').toLowerCase()==='excluded'||occ?.exception_task_id) continue;
    const ass=await ctx.env.DB.prepare('SELECT GROUP_CONCAT(m.name,\'、\') assignees FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=?').bind(r.task_id).first<Row>();
    // 定期タスクも通常タスクと同じく ANY / ALL の完了条件を適用する。
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(r.task_id).first<Row>();
    const completed=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=? AND ta.task_id=(SELECT task_id FROM recurrence_rules WHERE id=(SELECT recurrence_rule_id FROM recurrence_occurrences WHERE id=?))').bind(Number(occ.id),Number(occ.id)).first<Row>();
    const mode=String(r.completion_mode||'ANY').toUpperCase();
    const isCompleted=mode==='ALL'
      ? Number(assigned?.c||0)>0 && Number(completed?.c||0)>=Number(assigned?.c||0)
      : Number(completed?.c||0)>0;
    const baseTime=String(r.start_at||'').slice(11,19); const endTime=String(r.end_at||'').slice(11,19);
    out.push({...r,id:-Number(occ.id),recurrence_occurrence_id:Number(occ.id),recurrence_rule_id:Number(r.id),occurrence_date:date,status:isCompleted?'completed':'pending',due_at:`${date} ${baseTime||'00:00:00'}`,start_at:baseTime?`${date} ${baseTime}`:null,end_at:endTime?`${date} ${endTime}`:null,assignees:String(ass?.assignees||'')});
  }
  return out;
}

async function expiredTasksFor(ctx:AppContext):Promise<Row[]> {
  const todayJst=dateOnly();
  return (await ctx.env.DB.prepare(`SELECT t.id,t.title,t.status,t.due_at,t.start_at,t.end_at,t.location,t.visibility_scope,
      (SELECT GROUP_CONCAT(m.name,'、') FROM task_assignees ta JOIN members m ON m.id=ta.member_id AND m.active=1 WHERE ta.task_id=t.id) AS assignees
    FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
      AND (t.task_kind IS NULL OR lower(t.task_kind)='task')
      AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
      AND date(COALESCE(t.end_at,t.due_at,t.start_at)) < date(?)
    ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),t.id`).bind(ctx.member!.family_id,ctx.member!.id,todayJst).all<Row>()).results;
}

async function makeViewData(ctx: AppContext, date:string) {
  const [tasks,items,recurring,shopping,expiredTasks] = await Promise.all([
    ctx.env.DB.prepare(`SELECT t.*,
      (SELECT GROUP_CONCAT(m.name,'、') FROM task_assignees ta JOIN members m ON m.id=ta.member_id AND m.active=1 WHERE ta.task_id=t.id) AS assignees
      FROM tasks t
      WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status IN ('pending','completed')
        AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
        AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
          OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?)))
      ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(ctx.member!.family_id,ctx.member!.id,date,date,date).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*, (SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id) AS assignees
      FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) AND i.due_at IS NOT NULL AND date(i.due_at)=date(?) ORDER BY i.due_at,i.status,i.id`).bind(ctx.member!.family_id,ctx.member!.id,date).all<Row>(),
    recurringForDate(ctx,date),
    ctx.env.DB.prepare(`SELECT s.*, t.title AS task_title,
      (SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) AS assignees
      FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')}) AND ((s.due_date IS NOT NULL AND s.due_date=?) OR (s.due_date IS NULL AND s.task_id IS NULL)) ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`).bind(ctx.member!.family_id,ctx.member!.id,date).all<Row>(),
expiredTasksFor(ctx)
  ]);
  return {date,tasks:[...tasks.results,...recurring].sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at))),items:items.results,shopping:shopping.results,expiredTasks};
}

export async function today(request: Request, ctx: AppContext, targetDate: string): Promise<Response> { requireMember(ctx); const data=await makeViewData(ctx,targetDate); const unorganized=await unorganizedTasksFor(ctx); return html(renderDailyPage(ctx,targetDate,data,false,unorganized)); }
export async function tomorrow(request: Request, ctx: AppContext, targetDate: string): Promise<Response> { requireMember(ctx); const data=await makeViewData(ctx,targetDate); const unorganized=await unorganizedTasksFor(ctx); return html(renderDailyPage(ctx,targetDate,data,true,unorganized)); }

export async function taskEvents(request: Request, ctx: AppContext, targetDate: string): Promise<Response> {
  requireMember(ctx);
  const safeDate=/^\d{4}-\d{2}-\d{2}$/.test(targetDate)?targetDate:dateOnly();
  const data=await makeViewData(ctx,safeDate);
  const unorganized=await unorganizedTasksFor(ctx);
  return html(renderDailyPage(ctx,safeDate,data,false,unorganized,true));
}

async function unorganizedTasksFor(ctx:AppContext):Promise<Row[]> { return (await ctx.env.DB.prepare(`SELECT t.id,t.title,t.description,t.created_at,t.created_by,COALESCE(GROUP_CONCAT(m.name,'、'),'') assignees FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members m ON m.id=ta.member_id AND m.active=1 WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending' AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event') AND t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL GROUP BY t.id ORDER BY t.sort_order,t.id DESC LIMIT 50`).bind(ctx.member!.family_id,ctx.member!.id).all<Row>()).results; }

function renderDailyPage(ctx:AppContext,date:string,data:{tasks:Row[];items:Row[];shopping:Row[];expiredTasks:Row[]},tomorrow:boolean,unorganized:Row[]=[],unified=false):string {
  const csrf=ctx.session.csrfToken ?? '';
  const shoppingByTask=new Map<number,Row[]>();
  const itemsByTask=new Map<number,Row[]>();
  const unlinked:Row[]=[];
  for(const item of data.shopping){
    const tid=Number(item.task_id||0);
    if(tid){ const list=shoppingByTask.get(tid)||[]; list.push(item); shoppingByTask.set(tid,list); }
    else unlinked.push(item);
  }
  for(const item of data.items){ const tid=Number(item.task_id||0); if(tid){ const list=itemsByTask.get(tid)||[]; list.push(item); itemsByTask.set(tid,list); } }
  const shoppingRows=(items:Row[])=>items.map(i=>`<div class="linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${esc(i.id)}" ${i.status==='completed'?'checked':''}><span class="${i.status==='completed'?'done':''}">${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)}</a>`:`<a href="/app/shopping_edit.php?id=${i.id}">${esc(i.name)}</a>`}${i.quantity&&i.quantity!=='1'?` × ${esc(i.quantity)}`:''}</span></label><div class="meta">${[i.category||'',i.assignees?'担当 '+i.assignees:'',i.due_date?'期限 '+i.due_date:''].filter(Boolean).map(esc).join(' ・ ')}${i.url?` ・ <a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">商品ページ</a>`:''}</div></div>`).join('');
  const rows=data.tasks.map(t=>{
    const templateId=Number(t.task_id||0)||Math.abs(Number(t.id));
    const linked=shoppingByTask.get(templateId)||shoppingByTask.get(Math.abs(Number(t.id)))||[];
    const linkedItems=itemsByTask.get(templateId)||itemsByTask.get(Math.abs(Number(t.id)))||[];
    const taskShopping=linked.length?`<details class="task-shopping"><summary>🛒 買い物 ${linked.length}件</summary>${shoppingRows(linked)}</details>`:'';
    const itemRows=linkedItems.map(i=>`<div class="linked-shopping-row"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(i.id)}" ${i.status==='completed'?'checked':''}><span class="${i.status==='completed'?'done':''}">🎒 ${esc(i.name)}</span></label></div>`).join('');
    const childItems=linkedItems.length?`<details class="task-shopping"><summary>🎒 持ち物 ${linkedItems.length}件</summary>${itemRows}</details>`:'';
    const shoppingAdd=`<a class="task-shopping-add" href="/app/shopping_new.php?date=${encodeURIComponent(date)}&task_id=${templateId}" aria-label="このタスクに買い物を追加" title="買い物を追加"><span aria-hidden="true">🛒</span><span class="shopping-plus-badge" aria-hidden="true">＋</span></a>`;
    const shoppingBlock=taskShopping||childItems?`<div class="task-children">${taskShopping}${childItems}</div>`:'';
    const isEvent=String(t.task_kind||'').toLowerCase()==='event';
    const privateBadge=String(t.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':'';
    const titleHtml=Number(t.id)<0?`<span>${esc(t.title)} <small>(定期)</small></span>`:`${privateBadge}<a href="/task/view.php?id=${t.id}">${isEvent?'📌 ':''}${esc(t.title)}</a>`;
    const mainHtml=isEvent?`<div class="task-main event-main"><span>${titleHtml} <small>(イベント)</small></span>${shoppingAdd}</div>`:`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="${Number(t.id)<0?'recurrence':'task'}" data-id="${esc(t.id)}" ${Number(t.id)<0?`data-occurrence-id="${esc(t.recurrence_occurrence_id)}"`:''} ${t.status==='completed'?'checked':''}><span class="${t.status==='completed'?'done':''}">${titleHtml}</span></label>${shoppingAdd}</div>`;
    const familyLogAction=Number(t.id)<0&&Number(t.family_log_template_id||0)?`<button type="button" class="btn small secondary occurrence-family-log" data-occurrence-id="${esc(t.recurrence_occurrence_id)}">🐣 記録して完了</button>`:'';
    return `<div class="row task-row ${isEvent?'event-task-row':''}">${mainHtml}<div class="meta">${esc(t.assignees||'')}${t.start_at?' ・ '+esc(String(t.start_at).slice(11,16)):t.due_at?' ・ '+(String(t.due_at).slice(11,16)==='00:00'?'終日':esc(String(t.due_at).slice(11,16))):''}${t.location?' ・ '+esc(t.location):''}</div>${familyLogAction}${shoppingBlock}</div>`;
  }).join('');
  const standaloneItems=data.items.filter(i=>!Number(i.task_id||0));
  const items=standaloneItems.map(i=>`<div class="row"><label style="display:flex;gap:10px;align-items:center"><input class="check toggle" type="checkbox" data-type="item" data-id="${esc(i.id)}" ${i.status==='completed'?'checked':''}><span class="${i.status==='completed'?'done':''}"><a href="/item/edit.php?id=${i.id}">${esc(i.name)}</a></span></label><div class="meta">${[i.assignees?'担当 '+i.assignees:''].filter(Boolean).map(esc).join(' ・ ')}</div></div>`).join('');
  const unlinkedShopping=data.shopping.filter(i=>!Number(i.task_id||0));
  const unlinkedShoppingHtml=unlinkedShopping.length?`<div class="card section-card unlinked-shopping-section"><details><summary>🛒 その他の買い物（${unlinkedShopping.length}件）</summary>${shoppingRows(unlinkedShopping)}</details></div>`:'';
  const unorganizedHtml=unorganized.length?`<div class=\"card section-card unorganized-section\"><div class=\"section-head\"><h2>📋 未整理</h2><span class=\"meta\">期限なし ${unorganized.length}件</span></div>${unorganized.map(t=>`<div class=\"row\"><label class=\"task-main\"><input class=\"check toggle\" type=\"checkbox\" data-type=\"task\" data-id=\"${t.id}\"><span><a href=\"/task/view.php?id=${t.id}\">${esc(t.title)}</a></span></label><div class=\"meta\">${esc(t.assignees||'')}</div></div>`).join('')}<a class=\"btn small secondary\" href=\"/task/new.php?date=\">＋ 未整理タスクを追加</a></div>`:'';
  const expiredHtml=data.expiredTasks.length?`<details class="card expired-tasks"><summary>⚠️ 期限切れタスク ${data.expiredTasks.length}件</summary><div class="expired-list">${data.expiredTasks.map(t=>`<div class="expired-row" data-expired-task-id="${esc(t.id)}"><label class="expired-task-main"><input class="check toggle expired-checkbox" type="checkbox" data-type="task" data-id="${esc(t.id)}"><span>${String(t.visibility_scope)==='PRIVATE'?'<span class="private-task-badge" title="自分専用">🔒</span> ':''}<a href="/task/view.php?id=${esc(t.id)}">${esc(t.title)}</a></span></label><div class="expired-meta">期限 ${esc(String(t.end_at||t.due_at||t.start_at).slice(0,10))} ・ 担当 ${esc(t.assignees||'未設定')}${t.location?' ・ '+esc(t.location):''}</div></div>`).join('')}</div></details>`:'';
  const dt=new Date(`${date}T12:00:00Z`);dt.setUTCDate(dt.getUTCDate()-1);const prev=dt.toISOString().slice(0,10);dt.setUTCDate(dt.getUTCDate()+2);const next=dt.toISOString().slice(0,10);
  const todayDate=dateOnly();const td=new Date(`${todayDate}T12:00:00Z`);td.setUTCDate(td.getUTCDate()+1);const tomorrowDate=td.toISOString().slice(0,10);
  const pageTitle=unified?'タスク・イベント':(tomorrow?'明日の準備':'今日');
  const basePath=unified?'/app/tasks.php':(tomorrow?'/tomorrow.php':'/today.php');
  const eventCount=data.tasks.filter(t=>String(t.task_kind||'').toLowerCase()==='event').length;
  const normalCount=data.tasks.length-eventCount;
  const unifiedTabs=unified?`<div class="task-event-tabs"><a class="${date===todayDate?'active':''}" href="/app/tasks.php?date=${todayDate}">今日</a><a class="${date===tomorrowDate?'active':''}" href="/app/tasks.php?date=${tomorrowDate}">明日</a><a href="/app/calendar.php?month=${encodeURIComponent(date.slice(0,7))}&date=${encodeURIComponent(date)}">カレンダー</a></div>`:'';
  const heading=unified?'✅ タスク・イベント':(tomorrow?'🌙 明日の準備':'☀️ 今日');
  const summary=unified?`<div class="task-event-summary meta">タスク・定期 ${normalCount}件${eventCount?` ・ イベント ${eventCount}件`:''}</div>`:'';
  const taskAddHref=`/task/new.php?date=${encodeURIComponent(date)}${unified?'&return=tasks':''}`;
  const taskSectionTitle=unified?'📝 タスク・イベント':'📝 タスク';
  return layout(pageTitle,`${unifiedTabs}<div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>${heading}</h1><div class="date-title">${esc(date)}</div>${summary}<div class="meta">${esc(ctx.member?.name||'')}</div></div><div class="date-nav"><a class="btn gray" href="${basePath}?date=${prev}">‹</a><a class="btn gray" href="${basePath}?date=${next}">›</a></div></div><div class="card section-card task-section"><div class="section-head"><h2>${taskSectionTitle}</h2><a class="btn small" href="${taskAddHref}">＋ 追加</a></div>${rows||'<p class="empty">対象日のタスク・イベントはありません。</p>'}</div>${unorganizedHtml}${expiredHtml}<div class="card section-card item-section"><div class="section-head"><h2>🎒 持ち物</h2><a class="btn small" href="/item/new.php?date=${date}">＋ 追加</a></div>${items||'<p class="empty">対象日の持ち物はありません。</p>'}</div>${unlinkedShoppingHtml}<script type="application/json" id="dailyPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-events.js?v=12.106-wave87"></script><script src="/assets/occurrence-family-log.js?v=12.101-wave82"></script>`,unified?'/app/tasks.php':basePath);
}

async function logActivity(ctx: AppContext, action: string, targetType: string, targetId: number | null, metadata: Row = {}) {
  if (!ctx.member) return;
  try {
    // Family activity logs are shared. Never place private task/child data there.
    if(targetId&&targetType==='task'){
      const task=await ctx.env.DB.prepare("SELECT visibility_scope FROM tasks WHERE id=? AND family_id=?").bind(targetId,ctx.member.family_id).first<Row>();
      if(String(task?.visibility_scope)==='PRIVATE')return;
    }
    if(targetId&&(targetType==='item'||targetType==='shopping')){
      const table=targetType==='item'?'items':'shopping_items';
      const child=await ctx.env.DB.prepare(`SELECT t.visibility_scope FROM ${table} c JOIN tasks t ON t.id=c.task_id AND t.family_id=c.family_id WHERE c.id=? AND c.family_id=?`).bind(targetId,ctx.member.family_id).first<Row>();
      if(String(child?.visibility_scope)==='PRIVATE')return;
    }
    await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)')
      .bind(ctx.member.family_id,ctx.member.id,action,targetType,targetId,JSON.stringify(metadata),nowJst()).run();
  } catch (e) { console.error('[Family TODO LINE] activity log', e); }
}

export async function toggle(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const b=await bodyJson(request); await ensureCsrf(ctx,b.csrf);
  const type=String(b.type??''); const id=Number(b.id??0); const completed=Boolean(b.completed);
  if(!['task','item','shopping','recurrence'].includes(type)||!id) throw new BadRequest('対象が不正です。');
  const now=nowJst();
  if(type==='recurrence'){
    const occId=Number(b.occurrence_id||id);
    const occ=await ctx.env.DB.prepare('SELECT o.id,o.family_id,o.recurrence_rule_id FROM recurrence_occurrences o WHERE o.id=? AND o.family_id=?').bind(occId,m.family_id).first<Row>();
    if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);
    const rule=await ctx.env.DB.prepare('SELECT task_id,completion_mode FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(occ.recurrence_rule_id),m.family_id).first<Row>();
    if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);
    if(completed){
      await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(occId,m.id,now).run();
    }else{
      await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?').bind(occId,m.id).run();
    }
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rule.task_id)).first<Row>();
    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(Number(rule.task_id),m.id).first<Row>();
    if(Number(assigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);
    if(!actorAssigned) return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=?').bind(Number(rule.task_id),occId).first<Row>();
    const mode=String(rule.completion_mode||'ANY').toUpperCase();
    const isComplete=mode==='ALL'
      ? Number(assigned?.c||0)>0 && Number(done?.c||0)>=Number(assigned?.c||0)
      : Number(done?.c||0)>0;
    await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?')
      .bind(isComplete?'completed':'pending',isComplete?m.id:null,isComplete?now:null,now,occId,m.family_id).run();
    await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','recurrence',occId,{occurrence_id:occId,rule_id:Number(occ.recurrence_rule_id),status:isComplete?'completed':'pending'});
    return commitSession(json({ok:true,status:isComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }

  if(type==='task'){
    const task=await accessibleTaskById(ctx,id,'t.id,t.status,t.completion_mode,t.task_kind,t.visibility_scope,t.private_owner_id'); if(!task)return json({ok:false,error:'タスクが見つかりません。'},404);
    if(String(task.task_kind||'').toLowerCase()==='event')return json({ok:false,error:'イベントは完了チェックの対象外です。'},409);
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(id).first<Row>();
    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
    if(Number(assigned?.c||0)>0 && !actorAssigned) return json({ok:false,error:'このタスクの担当者ではありません。'},403);
    if(completed){
      await ctx.env.DB.prepare('INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run();
      const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(id).first<Row>();
      const shouldComplete=Number(assigned?.c||0)>0 && (String(task.completion_mode||'ANY').toUpperCase()==='ALL' ? Number(done?.c||0)>=Number(assigned?.c||0) : Number(done?.c||0)>0);
      await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shouldComplete?'completed':'pending',shouldComplete?m.id:null,shouldComplete?now:null,now,id,m.family_id).run();
    }else{
      await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id=?').bind(id,m.id).run();
      const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(id).first<Row>();
      const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(id).first<Row>();
      const mode=String(task.completion_mode||'ANY').toUpperCase();
      const stillComplete=mode==='ALL' ? Number(assigned?.c||0)>0 && Number(done?.c||0)>=Number(assigned?.c||0) : Number(done?.c||0)>0;
      const latest=stillComplete ? await ctx.env.DB.prepare('SELECT member_id,completed_at FROM task_completions WHERE task_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>() : null;
      await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(stillComplete?'completed':'pending',stillComplete?Number(latest?.member_id||0)||null: null,stillComplete?String(latest?.completed_at||now):null,now,id,m.family_id).run();
    }
    if(String((await ctx.env.DB.prepare('SELECT status FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>())?.status||'pending')==='completed') await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run(); await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','task',id,{status:completed?'completed':'pending'});
    const latest=await ctx.env.DB.prepare('SELECT status FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>(); return commitSession(json({ok:true,status:String(latest?.status||'pending')}),ctx.session,ctx.env.APP_SECRET);
  }
  if(type==='item'){
    const item=await ctx.env.DB.prepare(`SELECT i.id FROM items i WHERE i.id=? AND i.family_id=? AND (i.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>(); if(!item)return json({ok:false,error:'持ち物が見つかりません。'},404);
    const itemAssigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(id).first<Row>();
    const itemActorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=? AND ia.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
    if(Number(itemAssigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない持ち物は完了できません。'},409);
    if(!itemActorAssigned) return json({ok:false,error:'この持ち物の担当者ではありません。'},403);
    if(completed) await ctx.env.DB.prepare('INSERT INTO item_completions(item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run(); else await ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id=?').bind(id,m.id).run();
    const itemMode=await ctx.env.DB.prepare('SELECT completion_mode FROM items WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(id).first<Row>();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=?').bind(id).first<Row>();
    const mode=String(itemMode?.completion_mode||'ANY').toUpperCase();
    const itemComplete=mode==='ALL' ? Number(assigned?.c||0)>0 && Number(done?.c||0)>=Number(assigned?.c||0) : Number(done?.c||0)>0;
    const latest=itemComplete ? await ctx.env.DB.prepare('SELECT member_id,completed_at FROM item_completions WHERE item_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>() : null;
    await ctx.env.DB.prepare('UPDATE items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(itemComplete?'completed':'pending',itemComplete?Number(latest?.member_id||0)||null:null,itemComplete?String(latest?.completed_at||now):null,now,id,m.family_id).run(); await ctx.env.DB.prepare('INSERT INTO item_completion_history(item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run(); await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','item',id,{status:itemComplete?'completed':'pending'}); return commitSession(json({ok:true,status:itemComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
  }
  const current=await ctx.env.DB.prepare(`SELECT s.id,s.completion_mode FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>(); if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
  const shopAssigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=?').bind(id).first<Row>();
  const shopActorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=? AND sa.member_id=? LIMIT 1').bind(id,m.id).first<Row>();
  if(Number(shopAssigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない買い物は完了できません。'},409);
  if(!shopActorAssigned) return json({ok:false,error:'この買い物の担当者ではありません。'},403);
  if(completed) await ctx.env.DB.prepare('INSERT INTO shopping_completions(shopping_item_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(shopping_item_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,m.id,now).run(); else await ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id=?').bind(id,m.id).run();
  const shopDone=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=?').bind(id).first<Row>();
  const shopMode=String(current.completion_mode||'ANY').toUpperCase();
  const shopComplete=shopMode==='ALL' ? Number(shopAssigned?.c||0)>0 && Number(shopDone?.c||0)>=Number(shopAssigned?.c||0) : Number(shopDone?.c||0)>0;
  const shopLatest=shopComplete ? await ctx.env.DB.prepare('SELECT member_id,completed_at FROM shopping_completions WHERE shopping_item_id=? ORDER BY completed_at DESC,member_id DESC LIMIT 1').bind(id).first<Row>() : null;
  await ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shopComplete?'completed':'pending',shopComplete?Number(shopLatest?.member_id||0)||null:null,shopComplete?String(shopLatest?.completed_at||now):null,now,id,m.family_id).run();
  await ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now).run(); await logActivity(ctx,completed?'COMPLETED':'UNCOMPLETED','shopping',id,{status:shopComplete?'completed':'pending'}); return commitSession(json({ok:true,status:shopComplete?'completed':'pending'}),ctx.session,ctx.env.APP_SECRET);
}

function jpHolidayBase(date:string): string | null {
  const d=new Date(`${date}T12:00:00Z`);
  const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, day=d.getUTCDate();
  const nthMonday=(month:number,nth:number)=>{
    const first=new Date(Date.UTC(y,month-1,1));
    return 1+((8-first.getUTCDay())%7)+(nth-1)*7;
  };
  const vernal=Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const autumnal=Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const fixed:Record<string,string>={
    [`${y}-01-01`]:'元日',
    [`${y}-02-11`]:'建国記念の日',
    [`${y}-02-23`]:'天皇誕生日',
    [`${y}-03-${String(vernal).padStart(2,'0')}`]:'春分の日',
    [`${y}-04-29`]:'昭和の日',
    [`${y}-05-03`]:'憲法記念日',
    [`${y}-05-04`]:'みどりの日',
    [`${y}-05-05`]:'こどもの日',
    [`${y}-08-11`]:'山の日',
    [`${y}-09-${String(autumnal).padStart(2,'0')}`]:'秋分の日',
    [`${y}-11-03`]:'文化の日',
    [`${y}-11-23`]:'勤労感謝の日'
  };
  if(fixed[date]) return fixed[date];
  if(m===1&&day===nthMonday(1,2)) return '成人の日';
  if(m===7&&day===nthMonday(7,3)) return '海の日';
  if(m===9&&day===nthMonday(9,3)) return '敬老の日';
  if(m===10&&day===nthMonday(10,2)) return 'スポーツの日';
  return null;
}
function jpHolidayName(date:string): string | null {
  const d=new Date(`${date}T12:00:00Z`);
  const wd=d.getUTCDay();
  const base=jpHolidayBase(date);
  if(base) return base;
  if(wd>=1&&wd<=5){
    const prev=new Date(d);prev.setUTCDate(prev.getUTCDate()-1);
    const next=new Date(d);next.setUTCDate(next.getUTCDate()+1);
    if(jpHolidayBase(prev.toISOString().slice(0,10))&&jpHolidayBase(next.toISOString().slice(0,10))) return '国民の休日';
  }
  // 日曜祝日の振替休日。連続する祝日がある場合も、最初の非祝日平日まで遡って判定する。
  if(wd>=1&&wd<=6){
    const cursor=new Date(d);cursor.setUTCDate(cursor.getUTCDate()-1);
    for(let n=0;n<8;n++){
      const cd=cursor.toISOString().slice(0,10);
      if(cursor.getUTCDay()===0 && jpHolidayBase(cd)) return '振替休日';
      if(jpHolidayBase(cd)){cursor.setUTCDate(cursor.getUTCDate()-1);continue;}
      break;
    }
  }
  return null;
}

export async function calendar(request:Request,ctx:AppContext,month:string):Promise<Response>{
  const member=requireMember(ctx);
  const url=new URL(request.url);
  const openRaw=String(url.searchParams.get('open')||'');
  const openCandidate=new Date(`${openRaw}T12:00:00Z`);
  const openDate=/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(openRaw)&&!Number.isNaN(openCandidate.getTime())&&openCandidate.toISOString().slice(0,10)===openRaw?openRaw:'';
  const requestedMonth=openDate?openDate.slice(0,7):month;
  const m=/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(requestedMonth)?requestedMonth:dateOnly().slice(0,7);
  const [y,mo]=m.split('-').map(Number);
  const first=new Date(Date.UTC(y,mo-1,1));
  const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  const end=new Date(Date.UTC(y,mo,0));end.setUTCDate(end.getUTCDate()+(6-end.getUTCDay()));
  const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10),fid=member.family_id;

  const tasks=await ctx.env.DB.prepare(`
    SELECT t.*,GROUP_CONCAT(m.name,'、') assignees
    FROM tasks t
    LEFT JOIN task_assignees ta ON ta.task_id=t.id
    LEFT JOIN members m ON m.id=ta.member_id AND m.active=1
    WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.calendar_visible=1
      AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
      AND (
        (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
        OR
        (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at) BETWEEN date(?) AND date(?))
      )
    GROUP BY t.id
    ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id
  `).bind(fid,member.id,to,from,from,to).all<Row>();



  const recurRows:Row[]=[];
  for(let d=new Date(`${from}T12:00:00Z`);d<=new Date(`${to}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){
    recurRows.push(...await recurringForDate(ctx,d.toISOString().slice(0,10)));
  }
  const visibleRecur=recurRows.filter(t=>Number(t.calendar_visible??1)===1);
  const [shopping,items]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.*,t.title task_title,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')}) AND s.due_date BETWEEN ? AND ? ORDER BY s.due_date,s.category,s.name,s.id`).bind(fid,member.id,from,to).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,(SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id) assignees FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN date(?) AND date(?) ORDER BY i.due_at,i.id`).bind(fid,member.id,from,to).all<Row>()
  ]);
  return html(renderCalendarPage(ctx,m,start,end,[...tasks.results,...visibleRecur],shopping.results,items.results,[...tasks.results,...recurRows],openDate));
}

export function calendarDisplayLabel(task:Row,options:{includeTime?:boolean}={}){
  const title=String(task.title||''),time=Number(task.all_day??0)!==1&&task.start_at?String(task.start_at).slice(11,16):'';
  if(options.includeTime===false||!/^\d{2}:\d{2}$/.test(time))return {time:'',title,label:title};
  const normalized=title.normalize('NFKC'),same=normalized.match(/^\s*(\d{1,2}):(\d{2})(?:\s*[-~～〜–—])?\s*/);
  const displayTitle=same&&`${same[1].padStart(2,'0')}:${same[2]}`===time?normalized.slice(same[0].length):title;
  return {time,title:displayTitle||title,label:`${time} ${displayTitle||title}`};
}

function calendarLabelHtml(task:Row,includeTime=true){const display=calendarDisplayLabel(task,{includeTime}),icon=String(task.task_kind||'').toLowerCase()==='event'?'📌 ':'';return {accessible:`${display.time?display.time+' ':''}${icon}${display.title}`,html:`${display.time?`<span class="calendar-item-time">${display.time}</span> `:''}${icon}${esc(display.title)}`};}

function renderCalendarPage(ctx:AppContext,month:string,start:Date,end:Date,tasks:Row[],shopping:Row[],items:Row[]=[],detailTasks:Row[]=tasks,openDate=''):string{
  const map:Record<string,Row[]>=Object.create(null);
  const detailMap:Record<string,Row[]>=Object.create(null);
  const shoppingMap:Record<string,Row[]>=Object.create(null);
  const itemMap:Record<string,Row[]>=Object.create(null);
  const addToMap=(target:Record<string,Row[]>,t:Row)=>{
    const s=String(t.start_at||t.due_at||'').slice(0,10);
    const e=String(t.end_at||s).slice(0,10);
    if(!s)return;
    let d=new Date(`${s}T12:00:00Z`),last=new Date(`${e}T12:00:00Z`);
    if(last<d)last=d;
    const firstMs=new Date(`${s}T12:00:00Z`).getTime();
    const spanDays=Math.max(1,Math.round((last.getTime()-firstMs)/86400000)+1);
    for(;d<=last;d.setUTCDate(d.getUTCDate()+1)){
      const k=d.toISOString().slice(0,10);
      (target[k]??=[]).push({...t,_segment:d.getTime()===firstMs?'start':d.getTime()===last.getTime()?'end':'mid',_spanDays:spanDays});
    }
  };
  tasks.forEach(t=>addToMap(map,t));
  detailTasks.forEach(t=>addToMap(detailMap,t));
  for(const item of shopping){const d=String(item.due_date||'').slice(0,10);if(d)(shoppingMap[d]??=[]).push(item);}
  for(const item of items){const d=String(item.due_at||'').slice(0,10);if(d)(itemMap[d]??=[]).push(item);}

  // Wave61: restore XREA-style stable lanes for multi-day tasks. Single-day entries stay inside day cells.
  const allowedCalendarColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
  const rangeByKey=new Map<string,{start:string;end:string;task:Row}>();
  for(const t of tasks){
    const rs=String(t.start_at||t.due_at||'').slice(0,10); if(!rs)continue;
    let re=String(t.end_at||rs).slice(0,10); if(re<rs)re=rs;
    const key=String(t.id); rangeByKey.set(key,{start:rs,end:re,task:t});
  }
  const laneByKey=new Map<string,number>(),laneEnd:string[]=[];
  [...rangeByKey.entries()].filter(([,r])=>r.start!==r.end).sort((a,b)=>a[1].start.localeCompare(b[1].start)||a[1].end.localeCompare(b[1].end)||a[0].localeCompare(b[0])).forEach(([key,r])=>{
    let lane=0; while(laneEnd[lane]&&laneEnd[lane]>=r.start)lane++; laneByKey.set(key,lane); laneEnd[lane]=r.end;
  });
  const laneCap=4;
  const singleTaskCap=4;
  let cells='';
  for(let weekStart=new Date(start);weekStart<=end;weekStart.setUTCDate(weekStart.getUTCDate()+7)){
    const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekEnd.getUTCDate()+6);
    let dayCells='',bars='',more=''; const overflow:Record<string,number>=Object.create(null),dayBandRows:Record<string,number>=Object.create(null);
    const weekDays:Array<{d:string;inMonth:boolean;dayItems:Row[];holiday:string|null;wd:number;num:string;accessoryRows:number}>=[];
    let maxSingleRows=0,maxAccessoryRows=0,maxBandLane=-1;
    for(let i=0;i<7;i++){
      const cursor=new Date(weekStart);cursor.setUTCDate(cursor.getUTCDate()+i);
      const d=cursor.toISOString().slice(0,10),inMonth=d.startsWith(month),dayItems=(map[d]||[]).filter(t=>Number(t._spanDays||1)<=1).sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||(Number(a.id)-Number(b.id))),holiday=jpHolidayName(d),wd=cursor.getUTCDay();
      const num=d===dateOnly()?`<span class="today-num">${Number(d.slice(8))}</span>`:String(Number(d.slice(8)));
      const accessoryRows=(itemMap[d]?.length?1:0)+(shoppingMap[d]?.length?1:0);
      maxSingleRows=Math.max(maxSingleRows,Math.min(singleTaskCap,dayItems.length)+(dayItems.length>singleTaskCap?1:0));
      maxAccessoryRows=Math.max(maxAccessoryRows,accessoryRows);
      weekDays.push({d,inMonth,dayItems,holiday,wd,num,accessoryRows});
    }
    for(const [key,r] of rangeByKey){
      if(r.start===r.end)continue;
      const ws=weekStart.toISOString().slice(0,10),we=weekEnd.toISOString().slice(0,10),a=r.start>ws?r.start:ws,b=r.end<we?r.end:we;if(a>b)continue;
      const lane=laneByKey.get(key)??0;
      if(lane>=laneCap){for(let d=new Date(`${a}T12:00:00Z`);d<=new Date(`${b}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){const k=d.toISOString().slice(0,10);overflow[k]=(overflow[k]||0)+1;}continue;}
      maxBandLane=Math.max(maxBandLane,lane);
      const startCol=new Date(`${a}T12:00:00Z`).getUTCDay()+1,endCol=new Date(`${b}T12:00:00Z`).getUTCDay()+2,cc=String(r.task.calendar_color||'').trim(),color=allowedCalendarColors.includes(cc)?cc:'#7c3aed';
      const segClass=(a===r.start?'seg-start ':'')+(b===r.end?'seg-end':'seg-mid');
      const display=calendarLabelHtml(r.task,a===r.start);
      bars+=`<a class="calendar-band ${segClass.trim()}" style="grid-column:${startCol}/${endCol};grid-row:${lane+1};background:${color}" href="/task/view.php?id=${encodeURIComponent(String(r.task.id))}" data-task-id="${esc(r.task.id)}" title="${esc(display.accessible)}" aria-label="${esc(display.accessible)}">${display.html}</a>`;
      for(let dd=new Date(`${a}T12:00:00Z`),lastDd=new Date(`${b}T12:00:00Z`);dd<=lastDd;dd.setUTCDate(dd.getUTCDate()+1)){
        const dk=dd.toISOString().slice(0,10);dayBandRows[dk]=Math.max(dayBandRows[dk]||0,lane+1);
      }
    }
    const bandRows=maxBandLane+1;
    for(const info of weekDays){
      const cls=['calendar-cell',info.inMonth?'':'other',info.wd===0?'sun':'',info.wd===6?'sat':'',info.holiday?'holiday':''].filter(Boolean).join(' ');
      const shown=info.dayItems.slice(0,singleTaskCap);
      dayCells+=`<button type="button" class="${cls}" data-date="${info.d}" data-band-rows="${dayBandRows[info.d]||0}" style="--calendar-day-band-rows:${dayBandRows[info.d]||0};--calendar-day-content-top:calc(var(--calendar-date-zone) + ${dayBandRows[info.d]||0} * var(--calendar-band-step))" aria-label="${esc(info.d+(info.holiday?' '+info.holiday:''))}"><div class="num">${info.num}</div><div class="calendar-items">${shown.map(t=>{const cc=String(t.calendar_color||'').trim(),style=allowedCalendarColors.includes(cc)?` style="background:${cc}"`:'',display=calendarLabelHtml(t);return `<div class="calendar-item seg-single ${Number(t.id)<0?'recurring-single':''} ${String(t.task_kind||'').toLowerCase()==='event'?'event-single':''}" title="${esc(display.accessible)}" aria-label="${esc(display.accessible)}"${style}>${display.html}</div>`}).join('')}${info.dayItems.length>singleTaskCap?`<div class="calendar-task-overflow">+${info.dayItems.length-singleTaskCap}件</div>`:''}${itemMap[info.d]?.slice(0,1).map(i=>`<div class="calendar-item item">🎒 ${esc(i.name)}</div>`).join('')||''}${shoppingMap[info.d]?.length?`<div class="calendar-shopping">🛒 ${shoppingMap[info.d].length}件</div>`:''}</div></button>`;
    }
    for(let i=0;i<7;i++){const d=new Date(weekStart);d.setUTCDate(d.getUTCDate()+i);const k=d.toISOString().slice(0,10);more+=`<span>${overflow[k]?`+${overflow[k]}件`:''}</span>`;}
    const weekStyle=`--calendar-band-rows:${bandRows};--calendar-single-rows:${Math.max(1,maxSingleRows)};--calendar-accessory-rows:${maxAccessoryRows}`;
    cells+=`<div class="calendar-week" style="${weekStyle}"><div class="calendar-week-days">${dayCells}</div><div class="calendar-week-bands">${bars}</div><div class="calendar-week-more">${more}</div></div>`;
  }

  const shoppingDetail=Object.fromEntries(Object.entries(shoppingMap).map(([k,v])=>[k,v.map(t=>({id:t.id,name:t.name,quantity:t.quantity,category:t.category,status:t.status,due_date:t.due_date,task_title:t.task_title,assignees:t.assignees}))]));
  const itemDetail=Object.fromEntries(Object.entries(itemMap).map(([k,v])=>[k,v.map(t=>({id:t.id,name:t.name,status:t.status,due_at:t.due_at,assignees:t.assignees}))]));
  const detail=Object.fromEntries(Object.entries(detailMap).map(([k,v])=>[k,v.sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||(Number(a.id)-Number(b.id))).map(t=>({
    id:t.id,title:t.title,start_at:t.start_at,end_at:t.end_at,due_at:t.due_at,
    location:t.location,description:t.description??t.memo??'',
    recurring:Number(t.id)<0,family_log_template_id:Number(t.family_log_template_id||0),recurrence_occurrence_id:t.recurrence_occurrence_id??0,status:t.status??'pending',assignees:t.assignees??'',segment:t._segment??'single',spanDays:Number(t._spanDays||1),calendar_color:t.calendar_color??'',calendar_visible:Number(t.calendar_visible??1),task_kind:String(t.task_kind||''),sort_order:Number(t.sort_order||0)
  }))]));
  const holidays=Object.fromEntries(
    Array.from({length:Math.round((end.getTime()-start.getTime())/86400000)+1},(_,i)=>{
      const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);
      const k=d.toISOString().slice(0,10);return [k,jpHolidayName(k)];
    }).filter(([,v])=>v)
  );
  const prev=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-2,1)).toISOString().slice(0,7);
  const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,7);
  const calendarPayload=JSON.stringify({detail,shoppingDetail,itemDetail,holidays,month,prev,next,openDate,from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10),today:dateOnly(),csrf:ctx.session.csrfToken??''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const script='<script src="/assets/calendar.js?v=12.137.0-wave118"></script><script src="/assets/occurrence-family-log.js?v=12.101-wave82"></script>';
  const body='<div class="page-head calendar-page-head"><div><h1>📅 カレンダー</h1><button type="button" class="calendar-month-label" id="monthLabel" aria-expanded="false" aria-controls="calendarJumpPanel">'+month.slice(0,4)+'年'+Number(month.slice(5))+'月 ▼</button><div class="calendar-jump-panel" id="calendarJumpPanel" hidden><form id="calendarMonthJump" class="calendar-jump-row"><label>年<select name="year">'+Array.from({length:101},(_,i)=>2000+i).map(y=>`<option value="${y}" ${y===Number(month.slice(0,4))?'selected':''}>${y}</option>`).join('')+'</select></label><label>月<select name="month">'+Array.from({length:12},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===Number(month.slice(5))?'selected':''}>${n}</option>`).join('')+'</select></label><button type="submit" class="btn small">この月へ</button></form><form id="calendarDateJump" class="calendar-jump-row calendar-date-jump"><label>日付指定<input name="date" type="date" min="2000-01-01" max="2100-12-31" value="${openDate||dateOnly()}"></label><button type="submit" class="btn small">この日へ</button></form><div class="calendar-jump-shortcuts"><a class="btn gray small" href="/app/calendar.php?month=${dateOnly().slice(0,7)}">今月</a><a class="btn gray small" href="/app/calendar.php?month=${dateOnly().slice(0,7)}&open=${dateOnly()}">今日</a></div></div></div><div class="calendar-month-actions"><a id="prevMonth" data-month="'+prev+'" class="btn gray" href="/app/calendar.php?month='+prev+'" aria-label="前の月">‹</a> <a id="nextMonth" data-month="'+next+'" class="btn gray" href="/app/calendar.php?month='+next+'" aria-label="次の月">›</a></div></div>'+
    '<div class="card calendar-card"><div class="calendar-grid"><div class="weekday"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>'+cells+'</div></div>'+
    '<a class="fab calendar-fab" id="calendarFab" href="/task/new.php?date='+dateOnly()+'&return=calendar" aria-label="タスクを追加">＋</a><div class="modal-backdrop" id="dayModal"><div class="day-modal"><div class="modal-top"><button id="modalPrev" class="modal-day-nav" type="button" aria-label="前の日">‹</button><h2 id="modalTitle"></h2><button id="modalNext" class="modal-day-nav" type="button" aria-label="次の日">›</button><button id="modalReorder" class="btn gray small modal-reorder" type="button">並べ替え</button><button id="modalClose" class="btn gray modal-close" type="button" aria-label="閉じる">×</button></div><div class="modal-swipe-hint">左右にスワイプして日付移動</div><div class="modal-scroll"><div id="modalBody" class="modal-body"></div></div><a id="modalAdd" class="modal-add-fab" href="#" aria-label="この日にタスクを追加">＋</a></div></div><script type="application/json" id="calendarPayload">'+calendarPayload+'</script>'+script;
  return layout('カレンダー',body,'/app/calendar.php');
}


export async function messages(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);
  if(request.method==='POST'){
    const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'create');const now=nowJst();
    if(action==='delete'){
      const id=Number(b.id||0); const msg=await ctx.env.DB.prepare('SELECT id,sender_id FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg)return json({ok:false,error:'伝言が見つかりません。'},404);
      const role=String(m.role||'').toUpperCase(); if(Number(msg.sender_id)!==m.id&&role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'権限がありません。'},403);
      await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='message' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id),ctx.env.DB.prepare('DELETE FROM messages WHERE id=? AND family_id=?').bind(id,m.family_id)]);
      await logActivity(ctx,'DELETED','message',id); return json({ok:true});
    }
    if(action==='edit'){
      const id=Number(b.id||0); const msg=await ctx.env.DB.prepare('SELECT id,sender_id FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg)return json({ok:false,error:'伝言が見つかりません。'},404);
      const role=String(m.role||'').toUpperCase(); if(Number(msg.sender_id)!==m.id&&role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'権限がありません。'},403);
      const text=String(b.text??'').trim(); const target=Number(b.target_member_id??0)||null; if(!text)throw new BadRequest('伝言を入力してください。'); if(target){ const tm=await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(target,m.family_id).first<Row>(); if(!tm)throw new BadRequest('宛先のメンバーが見つかりません。'); }
      const reminderRaw=String(b.reminder_at??'').trim(); const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null; if(reminderRaw&&!reminderAt)throw new BadRequest('通知日時が不正です。');
      if(reminderAt && reminderAt <= nowJst()) throw new BadRequest('通知日時は現在より後の日時を指定してください。');
      await ctx.env.DB.prepare('UPDATE messages SET target_member_id=?,text=?,reminder_at=?,updated_at=? WHERE id=? AND family_id=?').bind(target,text,reminderAt,now,id,m.family_id).run();
      await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='message' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id).run();
      if(reminderAt){ const rs=target ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(target,m.family_id).all<Row>() : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND id<>?').bind(m.family_id,m.id).all<Row>(); if(rs.results.length) await ctx.env.DB.batch(rs.results.map(r=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'message_reminder','message',id,reminderAt,'pending',`【伝言】\n${text}`,now))); }
      await logActivity(ctx,'UPDATED','message',id); return json({ok:true});
    }
    if(action==='convert_shopping'||action==='convert_task'){
      const id=Number(b.id||0); const msg=await ctx.env.DB.prepare('SELECT * FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
      if(!msg) return json({ok:false,error:'伝言が見つかりません。'},404);
      if(action==='convert_shopping' && msg.converted_to_shopping_id)return json({ok:true,id:Number(msg.converted_to_shopping_id),already:true});
      if(action==='convert_task' && msg.converted_to_task_id)return json({ok:true,id:Number(msg.converted_to_task_id),already:true});
      const target=Number(msg.target_member_id||0)||null;
      if(action==='convert_shopping'){
        const name=String(b.name||msg.text||'').trim(); if(!name)throw new BadRequest('商品名を入力してください。');
        if(name.length>255)throw new BadRequest('商品名は255文字以内にしてください。');
        const quantity=String(b.quantity||'1').trim()||'1';
        const category=String(b.category||'').trim()||null;
        const memo=String(b.memo||'').trim()||null;
        const dueRaw=String(b.due_date||'').trim();
        if(dueRaw&&!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw))throw new BadRequest('期限の日付が不正です。');
        const url=String(b.url||'').trim()||null;
        if(url){try{const parsed=new URL(url);if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error();}catch{throw new BadRequest('商品URLが不正です。');}}
        const taskId=Number(b.task_id||0)||null;
        if(taskId){const tr=await ctx.env.DB.prepare("SELECT id FROM tasks WHERE id=? AND family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) LIMIT 1").bind(taskId,m.family_id).first<Row>();if(!tr)throw new BadRequest('紐付け先タスクが見つかりません。');}
        const assignees=[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
        if(!assignees.length&&target)assignees.push(target);
        if(assignees.length){const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();const ids=new Set(valid.results.map(x=>Number(x.id)));if(assignees.some(x=>!ids.has(x)))throw new BadRequest('担当者に無効なメンバーが含まれています。');}
        const r=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,quantity,category,memo,dueRaw||null,m.id,now,now,taskId,url).run(); const sid=Number(r.meta.last_row_id);
        if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));
        await ctx.env.DB.prepare('UPDATE messages SET converted_to_shopping_id=?,updated_at=? WHERE id=? AND family_id=?').bind(sid,now,id,m.family_id).run();
        await logActivity(ctx,'CONVERTED','message',id,{to:'shopping',shopping_item_id:sid});
        return commitSession(json({ok:true,id:sid}),ctx.session,ctx.env.APP_SECRET);
      }

      const mode=String(b.mode||'new');
      if(mode==='existing'){
        const taskId=Number(b.task_id||0);
        if(!taskId) throw new BadRequest('追加先のタスクを選択してください。');
        const task=await ctx.env.DB.prepare("SELECT id,description FROM tasks WHERE id=? AND family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) LIMIT 1").bind(taskId,m.family_id).first<Row>();
        if(!task) throw new BadRequest('追加先のタスクが見つかりません。');
        if(b.append_message!==false && String(b.append_message)!=='0'){
          const current=String(task.description||'').trim(); const addition=String(msg.text||'').trim();
          if(addition && !current.includes(addition)) await ctx.env.DB.prepare('UPDATE tasks SET description=?,updated_at=? WHERE id=? AND family_id=?').bind(current?`${current}\n\n【伝言から追加】\n${addition}`:`【伝言から追加】\n${addition}`,now,taskId,m.family_id).run();
        }
        await ctx.env.DB.prepare('UPDATE messages SET converted_to_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,id,m.family_id).run();
        await logActivity(ctx,'CONVERTED','message',id,{to:'existing_task',task_id:taskId});
        try { await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,taskId); } catch { /* local mutation remains authoritative */ }
        return commitSession(json({ok:true,id:taskId,mode:'existing'}),ctx.session,ctx.env.APP_SECRET);
      }

      const title=String(b.title||msg.text||'').trim(); if(!title)throw new BadRequest('タスク名を入力してください。');
      if(title.length>255) throw new BadRequest('タスク名は255文字以内にしてください。');
      const isEvent=Boolean(b.is_event); const noDate=!isEvent&&Boolean(b.no_date); const date=String(b.date||'').trim();
      if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
      if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('開始日を入力してください。');
      const endDate=String(b.end_date||date).trim();
      if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
      if(!noDate&&endDate<date) throw new BadRequest('終了日は開始日以降にしてください。');
      const allDay=b.all_day!==false && String(b.all_day)!=='0';
      const st=String(b.start_time||'').trim(),et=String(b.end_time||'').trim();
      const startAt=noDate?null:(allDay?`${date} 00:00:00`:(st?`${date} ${st}:00`:null));
      const endAt=noDate?null:(allDay?(endDate!==date?`${endDate} 23:59:59`:null):(et?`${endDate} ${et}:00`:null));
      if(!noDate&&!allDay&&!startAt) throw new BadRequest('開始時刻を入力してください。');
      if(startAt&&endAt&&endAt<startAt) throw new BadRequest('終了日時は開始日時以降にしてください。');
      const completionMode=String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
      const calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
      const colors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
      const calendarColor=colors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
      const reminderRaw=String(b.reminder_at||'').trim(); const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
      if(reminderRaw&&!reminderAt) throw new BadRequest('通知日時が不正です。');
      if(reminderAt&&reminderAt<=now) throw new BadRequest('通知日時は現在より後の日時を指定してください。');
      const assignees=[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
      if(!assignees.length&&target) assignees.push(target);
      if(assignees.length){const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();const validIds=new Set(valid.results.map(x=>Number(x.id)));if(assignees.some(x=>!validIds.has(x)))throw new BadRequest('担当者に無効なメンバーが含まれています。');}
      const due=noDate?null:(endAt||startAt||`${date} 00:00:00`);
      const description=String(b.description||msg.text||'').trim()||null;
      const r=await ctx.env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(m.family_id,title,description,due,'pending',completionMode,m.id,now,now,startAt,endAt,String(b.location||'').trim()||null,allDay?1:0,calendarVisible,calendarColor,isEvent?'EVENT':'TASK',0,reminderAt).run();
      const tid=Number(r.meta.last_row_id);
      if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(tid,mid,m.family_id)));
      if(reminderAt&&assignees.length){const rs=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();if(rs.results.length)await ctx.env.DB.batch(rs.results.map(x=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(x.id),'task_reminder','task',tid,reminderAt,'pending',`【タスク】${title}\n${description||'詳細なし'}`,now)));}
      await ctx.env.DB.prepare('UPDATE messages SET converted_to_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(tid,now,id,m.family_id).run();
      await logActivity(ctx,'CONVERTED','message',id,{to:'new_task',task_id:tid});
      try { await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,tid); } catch { /* local mutation remains authoritative */ }
      return commitSession(json({ok:true,id:tid,mode:'new'}),ctx.session,ctx.env.APP_SECRET);
    }
    const text=String(b.text??'').trim(); const target=Number(b.target_member_id??0)||null; if(!text)throw new BadRequest('伝言を入力してください。');
    const reminderRaw=String(b.reminder_at??'').trim(); const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null; if(reminderRaw&&!reminderAt)throw new BadRequest('通知日時が不正です。');
    if(reminderAt && reminderAt <= nowJst()) throw new BadRequest('通知日時は現在より後の日時を指定してください。');
    const ins=await ctx.env.DB.prepare('INSERT INTO messages(family_id,sender_id,target_member_id,text,reminder_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,target,text,reminderAt,now,now).run(); const msgId=Number(ins.meta.last_row_id);
    if(reminderAt){ const rs=target ? await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(target,m.family_id).all<Row>() : await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND id<>?').bind(m.family_id,m.id).all<Row>(); if(rs.results.length) await ctx.env.DB.batch(rs.results.map(r=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'message_reminder','message',msgId,reminderAt,'pending',`【伝言】\n${text}`,now))); }
    return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
  }
  const [rows,members,tasks]=await Promise.all([
    ctx.env.DB.prepare(`SELECT msg.*,s.name sender_name,r.name recipient_name,sh.name shopping_name,t.title task_title FROM messages msg LEFT JOIN members s ON s.id=msg.sender_id LEFT JOIN members r ON r.id=msg.target_member_id LEFT JOIN shopping_items sh ON sh.id=msg.converted_to_shopping_id LEFT JOIN tasks t ON t.id=msg.converted_to_task_id AND (t.visibility_scope='FAMILY' OR t.private_owner_id=?) WHERE msg.family_id=? ORDER BY msg.created_at DESC,msg.id DESC LIMIT 100`).bind(m.id,m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status<>'completed' AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) ORDER BY COALESCE(start_at,due_at),id DESC LIMIT 200").bind(m.family_id).all<Row>()
  ]);
  const today=dateOnly();
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>💬 伝言</h1></div><a class="btn" href="/app/message_new.php">＋ 伝言する</a></div>
  <div class="card message-list"><h2>伝言一覧</h2>${rows.results.map(r=>`<div class="row message-row"><div>${esc(r.text)}</div><div class="meta">${esc(r.sender_name||'')} → ${esc(r.recipient_name||'全員')} ・ ${esc(r.created_at||'')}</div>${r.reminder_at?`<div class="meta">🔔 通知 ${esc(String(r.reminder_at).slice(0,16))}</div>`:''}${r.converted_to_shopping_id?`<div class="converted-badge">🛒 買い物：${esc(r.shopping_name||'登録済み')}</div>`:r.converted_to_task_id?`<div class="converted-badge">📝 タスク・イベント：${esc(r.task_title||'登録済み')}</div>`:`<div class="message-actions"><button class="btn small convert-shopping" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}">🛒 買い物に追加</button><button class="btn gray small convert-task" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}">📝 タスク・イベントに追加</button></div>`}<div class="message-actions"><button class="btn gray small edit-message" data-id="${r.id}" data-text="${esc(r.text)}" data-target="${Number(r.target_member_id||0)}" data-reminder="${esc(r.reminder_at||'')}">編集</button><button class="btn danger small delete-message" data-id="${r.id}">削除</button></div></div>`).join('')||'<p>伝言はありません。</p>'}</div>
  <div class="card form-card"><form id="msgForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken??'')}"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map((r:Row)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" required></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">指定すると宛先へその日時に伝言内容を設定した通知方法で通知します。</p><button type="submit">投稿する</button></form></div>
  <div class="message-shopping-backdrop" id="messageShoppingModal" aria-hidden="true"><div class="message-shopping-dialog"><div class="section-head"><h2>🛒 伝言を買い物に追加</h2><button type="button" class="btn gray small" id="messageShoppingClose">×</button></div><form id="messageShoppingForm"><input type="hidden" name="message_id"><label>商品名</label><input name="name" maxlength="255" required><label>数量</label><input name="quantity" value="1"><label>カテゴリー</label><input name="category" placeholder="例：食品"><label>期限（任意）</label><input type="date" name="due_date"><label>紐付けるタスク（任意）</label><select name="task_id"><option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}">${esc(t.title)}${t.start_at||t.due_at?' ・ '+esc(String(t.start_at||t.due_at).slice(0,10)):''}</option>`).join('')}</select><label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="shopping_assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label>メモ</label><textarea name="memo"></textarea><label>商品URL（任意）</label><input type="url" name="url" placeholder="https://..."><div id="messageShoppingStatus" class="small" aria-live="polite"></div><button type="submit" id="messageShoppingSubmit">買い物に追加</button></form></div></div>
  <div class="message-task-backdrop" id="messageTaskModal" aria-hidden="true"><div class="message-task-dialog"><div class="section-head"><h2>📝 伝言をタスク・イベントに追加</h2><button type="button" class="btn gray small" id="messageTaskClose">×</button></div><form id="messageTaskForm"><input type="hidden" name="message_id"><label>追加方法</label><select name="mode" id="messageTaskMode"><option value="existing">既存タスク・イベントに追加</option><option value="new">新しいタスク・イベントを作成</option></select><div id="existingTaskFields"><label>追加先タスク・イベント</label><select name="task_id"><option value="0">選択してください</option>${tasks.results.map(t=>`<option value="${t.id}">${esc(t.title)}${t.start_at||t.due_at?' ・ '+esc(String(t.start_at||t.due_at).slice(0,10)):''}</option>`).join('')}</select><label class="checkrow"><input type="checkbox" name="append_message" checked><span>伝言本文を説明へ追記する</span></label></div><div id="newTaskFields" style="display:none"><label>タイトル</label><input name="title" maxlength="255"><label>説明</label><textarea name="description"></textarea><div class="date-option-row"><div><span class="small">開始日</span><input type="date" name="date" value="${today}"></div><div><span class="small">終了日</span><input type="date" name="end_date" value="${today}"></div><label class="checkrow"><input type="checkbox" name="no_date"><span>期限なし</span></label></div><label class="checkrow"><input id="messageTaskAllDay" type="checkbox" name="all_day" checked><span>終日</span></label><div id="messageTaskTimeFields" class="task-time-fields message-task-time" style="display:none"><div><label>開始時刻</label><input type="time" name="start_time"></div><div><label>終了時刻</label><input type="time" name="end_time"></div></div><label>場所</label><input name="location"><label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="task_assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label class="checkrow"><input type="checkbox" name="is_event"><span>イベントとして登録（チェック・期限切れ対象なし）</span></label><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select><label>通知日時（任意）</label><input type="datetime-local" name="task_reminder_at"><label class="checkrow"><input id="messageTaskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label><div id="messageTaskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div></div><div id="messageTaskStatus" class="small" aria-live="polite"></div><button type="submit" id="messageTaskSubmit">追加する</button></form></div></div>
  <div class="message-edit-backdrop" id="messageEditModal" aria-hidden="true"><div class="message-edit-dialog"><div class="section-head"><h2>✏️ 伝言を編集</h2><button type="button" class="btn gray small" id="messageEditClose">×</button></div><form id="messageEditForm"><input type="hidden" name="message_id"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map((r:Row)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" maxlength="5000" required></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">空欄で通知予約を解除します。</p><div id="messageEditStatus" class="small" aria-live="polite"></div><button type="submit" id="messageEditSubmit">保存する</button></form></div></div>
  <script type="application/json" id="messagesPayload">${JSON.stringify({csrf:ctx.session.csrfToken||'',today}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script>
  <script src="/assets/messages.js?v=12.97-wave78"></script>`;
  return html(layout('伝言',body,'/app/messages.php'));
}


function shoppingBatchForm(ctx:AppContext, tasks:Row[], date='', members:Row[]=[], selectedTaskId=0): string {
  const csrf=ctx.session.csrfToken??'';

  const taskOptions=tasks.map(t=>`<option value="${t.id}">${esc(t.title)}${t.start_at||t.due_at?`（${esc(String(t.start_at||t.due_at).slice(0,10))}）`:''}</option>`).join('');
  const defaultDate=esc(date);
  const selectedTask=tasks.find(t=>Number(t.id)===selectedTaskId),privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE';
  return `<div class="card form-card batch-shopping-card" id="addShopping">
    <div class="section-head"><h2>＋ 買い物を追加</h2><span class="meta">複数商品を一度に登録できます</span></div>
    <form id="shopBatchForm">
      <input type="hidden" name="csrf" value="${esc(csrf)}">
      <div id="shoppingProducts">
        <div class="product-row batch-product" data-product-row><input type="text" name="product_name[]" maxlength="255" placeholder="商品名" required><input type="text" name="product_quantity[]" value="1" inputmode="text" placeholder="数量" aria-label="数量"><button type="button" class="product-url-toggle" aria-expanded="false">🔗</button><span class="product-row-spacer" aria-hidden="true"></span><div class="product-url-popover" hidden><div class="product-url-popover-head"><strong>商品URL</strong><button type="button" class="product-url-close" aria-label="URL入力を閉じる">×</button></div><input type="url" name="product_url[]" placeholder="https://..." aria-label="商品URL"><p class="small">商品ページのURLがある場合だけ入力してください。</p></div></div>
      </div>
      <button type="button" class="btn gray small add-product" id="addProduct">＋ 商品を追加</button>
      <div class="batch-common-settings">
        <label>カテゴリー（全商品共通）</label>
        <input name="category" list="shoppingCategories" placeholder="例：食品">
        <datalist id="shoppingCategories"><option value="食品"><option value="日用品"><option value="子供"><option value="薬・衛生"><option value="その他"></datalist>
        <label>期限（全商品共通）</label>
        <input type="date" name="due_date" value="${defaultDate}">
        <label>担当者（全商品共通）</label>
        ${privateContext?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':`<div class="assignee-list">${members.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div>`}
        <label>関連タスク（全商品共通）</label>
        ${privateContext?`<p class="notice">🔒 自分専用タスク: ${esc(selectedTask?.title)}</p><input type="hidden" name="task_id" value="${selectedTaskId}">`:`<select name="task_id"><option value="0">タスクなし</option>${tasks.map(t=>`<option value="${t.id}" ${Number(t.id)===selectedTaskId?'selected':''}>${esc(t.title)}${t.start_at||t.due_at?`（${esc(String(t.start_at||t.due_at).slice(0,10))}）`:''}</option>`).join('')}</select>`}
        <label>メモ（全商品共通・任意）</label>
        <textarea name="memo" placeholder="例：低脂肪、○○店で購入"></textarea>
      </div>
      <button type="submit">まとめて登録する</button>
    </form>
  </div>
  <script type="application/json" id="shoppingNewPayload">${JSON.stringify({csrf}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script>
  <script src="/assets/shopping-new.js?v=12.97-wave78"></script>`;
}

export async function shopping(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);
  if(request.method==='POST'){
    const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);
    const action=String(b.action??'add');
    if(action==='to_task'){
      const id=Number(b.id||0);
      const item=await ctx.env.DB.prepare(`SELECT s.* FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')})) LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
      if(!item) return json({ok:false,error:'買い物項目が見つかりません。'},404);
      const now=nowJst();
      const due=String(item.due_date||'').trim();
      const r=await ctx.env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,task_kind,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)").bind(m.family_id,String(item.name||''),'買い物から作成',due?`${due} 00:00:00`:null,'pending','ANY',m.id,now,now,due?`${due} 00:00:00`:null,null,null,due?1:0,1,'task').run();
      const taskId=Number(r.meta.last_row_id);
      await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE shopping_items SET task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,id,m.family_id),ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,member_id FROM shopping_assignees WHERE shopping_item_id=?').bind(taskId,id)]);
      try { await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,taskId); } catch { /* local mutation remains authoritative */ }
      return commitSession(json({ok:true,id:taskId}),ctx.session,ctx.env.APP_SECRET);
    }
    if(action==='toggle'){
      const id=Number(b.id);const completed=Boolean(b.completed);const now=nowJst();
      const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${taskChildVisibilitySql('s')}`).bind(id,m.family_id,m.id).first<Row>();
      if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(completed?'completed':'pending',completed?m.id:null,completed?now:null,now,id,m.family_id),
        ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now),
      ]);
      return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
    }
    if(action==='add_batch'){
      const products=Array.isArray(b.products)?b.products as unknown[]:[];
      const normalized=products.map(v=>({name:String((v as any)?.name??'').trim(),quantity:String((v as any)?.quantity??'1').trim()||'1',url:String((v as any)?.url??'').trim()})).filter(v=>v.name);
      if(!normalized.length)throw new BadRequest('商品名を1つ以上入力してください。');
      if(normalized.length>50)throw new BadRequest('一度に登録できる商品は50件までです。');
      for(const p of normalized){if(p.url){try{const u=new URL(p.url);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{throw new BadRequest('商品URLが不正です。');}}}
      const category=String(b.category??'').trim()||null;
      const memo=String(b.memo??'').trim()||null;
      let due=String(b.due_date??'').trim()||null;
      if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new BadRequest('期限の日付が不正です。');
      const taskId=Number(b.task_id??0)||null;
            if(taskId){
        const t=await ctx.env.DB.prepare(`SELECT t.id,t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();
        if(!t)throw new BadRequest('関連タスクが見つかりません。');
        if(!due)due=String(t.start_at||t.due_at||'').slice(0,10)||null;
      }
      const privateOwner=await privateParentOwner(ctx,taskId);
      const now=nowJst();
      const statements=normalized.map(p=>ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,p.name,p.quantity,category,memo,due,m.id,now,now,taskId,p.url||null));
      const result=await ctx.env.DB.batch(statements);
      const assignees=privateOwner?[privateOwner]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);
      if(assignees.length){const ids=result.map((r:any)=>Number(r.meta?.last_row_id||0)).filter(Boolean);for(const sid of ids){await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}}
      return commitSession(json({ok:true,count:normalized.length}),ctx.session,ctx.env.APP_SECRET);
    }
    if(action==='add'){
      const name=String(b.name??'').trim();if(!name)throw new BadRequest('商品名を入力してください。');
      const qty=String(b.quantity??'1').trim()||'1';
      const category=String(b.category??'').trim()||null;
      const memo=String(b.memo??'').trim()||null;
      let due=String(b.due_date??'').trim()||null;
      if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new BadRequest('期限の日付が不正です。');
      const taskId=Number(b.task_id??0)||null;
            if(taskId){const t=await ctx.env.DB.prepare(`SELECT t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();if(!t)throw new BadRequest('関連タスクが見つかりません。');if(!due)due=String(t.start_at||t.due_at||'').slice(0,10)||null;}
      const now=nowJst();
      const rawUrl=String(b.url??'').trim(); if(rawUrl){try{const u=new URL(rawUrl);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{throw new BadRequest('商品URLが不正です。');}} const created=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,memo,due,m.id,now,now,taskId,rawUrl||null).run();
      await forcePrivateChildAssignee(ctx,'shopping',Number(created.meta.last_row_id),await privateParentOwner(ctx,taskId));
      return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
    }
  }
  const u=new URL(ctx.request.url); const view=u.searchParams.get('view')==='date'?'date':'category'; const cat=u.searchParams.get('category')||''; const dueFilter=u.searchParams.get('due')||'all'; const aid=Number(u.searchParams.get('assignee')||0)||0;
  const where:string[]=['s.family_id=?',taskChildVisibilitySql('s')]; const params:any[]=[m.family_id,m.id];
  if(cat){where.push('s.category=?');params.push(cat);}
  if(dueFilter==='none'){where.push('s.due_date IS NULL AND s.task_id IS NULL');}
  else if(dueFilter==='has'){where.push('(s.due_date IS NOT NULL OR s.task_id IS NOT NULL)');}
  if(aid){where.push('EXISTS(SELECT 1 FROM shopping_assignees za WHERE za.shopping_item_id=s.id AND za.member_id=?)');params.push(aid);}
  const rows=await ctx.env.DB.prepare(`SELECT s.*,t.title task_title,t.status task_status,t.start_at task_start_at,t.end_at task_end_at,t.due_at task_due_at,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE ${where.join(' AND ')} ORDER BY s.status,(s.due_date IS NULL),s.due_date,s.category,s.name,s.id`).bind(...params).all<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const cats=await ctx.env.DB.prepare(`SELECT DISTINCT s.category FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.category IS NOT NULL AND s.category<>'' ORDER BY s.category`).bind(m.family_id,m.id).all<Row>();
  const expired=await ctx.env.DB.prepare(`SELECT s.*,t.title task_title,t.status task_status,t.start_at task_start_at,t.end_at task_end_at,t.due_at task_due_at FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.status<>'completed' AND ((s.due_date IS NOT NULL AND s.due_date < ?) OR (s.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM tasks pt WHERE pt.id=s.task_id AND pt.family_id=s.family_id AND (pt.status='completed' OR date(COALESCE(pt.end_at,pt.start_at,pt.due_at)) < ?)))) ORDER BY COALESCE(s.due_date,substr(COALESCE(t.end_at,t.start_at,t.due_at),1,10)),s.id`).bind(m.family_id,m.id,dateOnly(),dateOnly()).all<Row>();
  const groups=new Map<string,Row[]>();
  for(const r of rows.results){const key=view==='date'?(String(r.due_date||r.task_start_at||r.task_due_at||'').slice(0,10)||'期限なし'):String(r.category||'カテゴリーなし');const list=groups.get(key)||[];list.push(r);groups.set(key,list);}
  const detailRows=[...expired.results,...rows.results];
  const shoppingDetail=Object.fromEntries(detailRows.map(r=>[String(r.id),{
    id:Number(r.id),name:String(r.name||''),quantity:String(r.quantity||'1'),category:String(r.category||''),
    memo:String(r.memo||''),due_date:String(r.due_date||''),task_id:Number(r.task_id||0),
    task_title:String(r.task_title||''),assignees:String(r.assignees||''),url:String(r.url||''),
    status:String(r.status||'pending')
  }]));
  const renderRow=(r:Row)=>`<div class="shopping-row compact-shopping-row" data-shopping-id="${r.id}">
    <label class="shopping-check-only" aria-label="${esc(r.name)}を完了にする"><input class="shop-toggle" type="checkbox" data-id="${r.id}" ${r.status==='completed'?'checked':''}></label>
    <button type="button" class="shopping-name-button ${r.status==='completed'?'done':''}" data-id="${r.id}">
      <span class="shopping-name-text">${esc(r.name)}</span>${r.quantity&&r.quantity!=='1'?`<span class="shopping-qty">×${esc(r.quantity)}</span>`:''}
    </button>
  </div>`;
  let listHtml=''; for(const [group,items] of groups){const pending=items.filter(r=>r.status!=='completed'),done=items.filter(r=>r.status==='completed');listHtml+=`<div class="card shopping-group-card"><div class="group-title">${esc(group)} <span class="meta">${items.length}件</span></div>${pending.map(renderRow).join('')}${done.length?`<details class="shopping-completed"><summary>完了済み ${done.length}件</summary>${done.map(renderRow).join('')}</details>`:''}</div>`;}
  const filterActive=view==='date'||Boolean(cat)||dueFilter!=='all'||Boolean(aid);
  const filterSummary=[view==='date'?'日付別':'カテゴリー別',cat?`カテゴリー：${cat}`:'',dueFilter==='has'?'期限あり':dueFilter==='none'?'期限なし':'',aid?`担当：${String(members.results.find(x=>Number(x.id)===aid)?.name||'指定')}`:''].filter(Boolean).join(' ・ ');
  const body=`<div class="page-head shopping-page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>🛒 買い物</h1></div></div>
  <details class="card shopping-filter-panel" ${filterActive?'open':''}><summary><span>表示・絞り込み</span><span class="shopping-filter-summary">${esc(filterSummary)}</span></summary><form class="filter-grid" method="get"><select name="view"><option value="category" ${view==='category'?'selected':''}>カテゴリー別</option><option value="date" ${view==='date'?'selected':''}>日付別</option></select><select name="category"><option value="">カテゴリー：すべて</option>${cats.results.map(c=>`<option value="${esc(c.category)}" ${cat===String(c.category)?'selected':''}>${esc(c.category)}</option>`).join('')}</select><select name="due"><option value="all" ${dueFilter==='all'?'selected':''}>期限：すべて</option><option value="has" ${dueFilter==='has'?'selected':''}>期限あり</option><option value="none" ${dueFilter==='none'?'selected':''}>期限なし</option></select><select name="assignee"><option value="0">担当者：すべて</option>${members.results.map(x=>`<option value="${x.id}" ${aid===Number(x.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select><button class="btn" type="submit">適用</button></form></details>
  ${listHtml||'<div class="card"><p class="empty">買い物はありません。</p></div>'}
  ${expired.results.length?`<div class="card expired-card"><details><summary class="expired-trigger">期限切れ（${expired.results.length}件）</summary>${expired.results.map(r=>`<button type="button" class="expired-row shopping-detail-open" data-id="${r.id}"><strong>${esc(r.name)}${r.quantity&&r.quantity!=='1'?' × '+esc(r.quantity):''}</strong><span class="expired-meta">${r.task_title?'タスク：'+esc(r.task_title):'タスクなし'}${r.due_date?' ・ 期限：'+esc(r.due_date):''}</span></button>`).join('')}</details></div>`:''}
  <a class="fab shopping-fab" href="/app/shopping_new.php?date=${dateOnly()}" aria-label="買い物を追加">＋</a>
  <div class="shopping-detail-backdrop" id="shoppingDetailModal" aria-hidden="true"><div class="shopping-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="shoppingDetailTitle"><div class="shopping-detail-head"><h2 id="shoppingDetailTitle">買い物詳細</h2><button type="button" class="shopping-detail-close" id="shoppingDetailClose" aria-label="閉じる">×</button></div><div id="shoppingDetailBody" class="shopping-detail-body"></div><div class="shopping-detail-actions"><a class="btn gray" id="shoppingDetailEdit" href="#">編集</a><button type="button" class="btn gray" id="shoppingDetailToTask">タスク化</button></div></div></div>
  <script type="application/json" id="shoppingPayload">${JSON.stringify({shoppingDetail,csrf:ctx.session.csrfToken??''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/shopping.js?v=12.105-wave86"></script>`;
  return html(layout('買い物',body,'/app/shopping.php'));
}

export async function home(ctx:AppContext):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/liff?next=%2Fapp%2Findex.php');
  const family=await ctx.env.DB.prepare('SELECT * FROM families WHERE id=? LIMIT 1').bind(m.family_id).first<Row>();
  const today=dateOnly();const td=new Date(`${today}T12:00:00Z`);td.setUTCDate(td.getUTCDate()+1);const tomorrowDate=td.toISOString().slice(0,10);
  const taskRowsForDate=(date:string)=>ctx.env.DB.prepare(`SELECT id,status,task_kind FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} AND status IN ('pending','completed') AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) AND ((start_at IS NOT NULL AND date(start_at)<=date(?) AND (end_at IS NULL OR date(end_at)>=date(?))) OR (start_at IS NULL AND due_at IS NOT NULL AND date(due_at)=date(?)))`).bind(m.family_id,m.id,date,date,date).all<Row>();
  const [todayPhysical,tomorrowPhysical,todayRecurring,tomorrowRecurring,shoppingCount,messageCount,familyLogCount]=await Promise.all([
    taskRowsForDate(today),taskRowsForDate(tomorrowDate),recurringForDate(ctx,today),recurringForDate(ctx,tomorrowDate),
    ctx.env.DB.prepare(`SELECT count(*) c FROM shopping_items s WHERE s.family_id=? AND s.status='pending' AND ${taskChildVisibilitySql('s')}`).bind(m.family_id,m.id).first<Row>(),
    ctx.env.DB.prepare("SELECT count(*) c FROM messages WHERE family_id=?").bind(m.family_id).first<Row>(),
    ctx.env.DB.prepare("SELECT count(*) c FROM family_logs WHERE family_id=? AND deleted_at IS NULL AND date(occurred_at)=date(?)").bind(m.family_id,today).first<Row>()
  ]);
  const summarize=(physical:Row[],recurring:Row[])=>({
    tasks:physical.filter(r=>String(r.task_kind||'').toLowerCase()!=='event'&&String(r.status||'pending')==='pending').length+recurring.filter(r=>String(r.status||'pending')==='pending').length,
    events:physical.filter(r=>String(r.task_kind||'').toLowerCase()==='event').length
  });
  const todaySummary=summarize(todayPhysical.results,todayRecurring),tomorrowSummary=summarize(tomorrowPhysical.results,tomorrowRecurring);
  const body=`<div class="home-hero"><div class="eyebrow">Family TODO LINE</div><h1>🏠 ${esc(family?.name||'家族')}</h1><p>${esc(m.name)} さん、今日の家族予定を確認しましょう。</p></div><div class="menu home-menu"><a class="task-events" href="/app/tasks.php"><span class="menu-icon">✅</span><strong>タスク・イベント</strong><small>今日: タスク ${todaySummary.tasks}件${todaySummary.events?` / イベント ${todaySummary.events}件`:''} ・ 明日: タスク ${tomorrowSummary.tasks}件${tomorrowSummary.events?` / イベント ${tomorrowSummary.events}件`:''}</small></a><a class="calendar" href="/app/calendar.php"><span class="menu-icon">📅</span><strong>カレンダー</strong><small>タスク・イベント・祝日</small></a><a class="shopping" href="/app/shopping.php"><span class="menu-icon">🛒</span><strong>買い物</strong><small>${Number(shoppingCount?.c||0)}件</small></a><a class="family-log" href="/app/family_log.php"><span class="menu-icon">🐣</span><strong>家族ログ</strong><small>今日 ${Number(familyLogCount?.c||0)}件</small></a><a class="message" href="/app/messages.php"><span class="menu-icon">💬</span><strong>伝言</strong><small>${Number(messageCount?.c||0)}件</small></a><a class="settings" href="/app/settings.php"><span class="menu-icon">⚙️</span><strong>管理</strong><small>家族・通知・定期タスク</small></a></div><div class="card quick-card"><div class="section-head"><h2>クイック操作</h2></div><div class="quick-actions"><a class="btn" href="/task/new.php?date=${today}&return=tasks">＋ タスク・イベント</a><a class="btn secondary" href="/item/new.php?date=${today}">＋ 持ち物</a><a class="btn secondary" href="/app/shopping_new.php?date=${today}">＋ 買い物</a></div></div>`;
  return html(layout('Family TODO LINE',body,'/app/index.php'));
}
export async function createFamilyPage(ctx:AppContext):Promise<Response>{
  const body=`<div class="card"><h1>家族を作成</h1><p class="meta">LINEアカウント：${esc(ctx.session.lineDisplayName||'')}</p><div id="familyActionError" class="error" style="display:none"></div><form id="familyCreate" data-family-endpoint="/api/family/create"><label>家族名</label><input name="family_name" maxlength="255" required placeholder="例：田中家"><label>あなたの名前</label><input name="member_name" maxlength="255" value="${esc(ctx.session.lineDisplayName||'')}" required><button type="submit">家族を作成する</button></form><hr><p>既存の家族に参加する場合は家族コードを入力してください。</p><form id="familyJoin" data-family-endpoint="/api/family/join"><label>家族コード</label><input name="family_code" maxlength="32" required><label>あなたの名前</label><input name="member_name" value="${esc(ctx.session.lineDisplayName||'')}" required><button type="submit">家族に参加する</button></form></div><script src="/assets/family-onboarding.js?v=12.97-wave78"></script>`;
  return html(layout('家族を作成',body));
}

export async function apiMe(ctx:AppContext):Promise<Response>{if(!ctx.member)return json({ok:true,authenticated:false});const family=await ctx.env.DB.prepare('SELECT id,name,family_code FROM families WHERE id=?').bind(ctx.member.family_id).first<Row>();return json({ok:true,authenticated:true,member:ctx.member,family});}


export async function taskView(ctx:AppContext, id:number):Promise<Response>{
  const m=requireMember(ctx); if(!Number.isInteger(id)||id===0) return new Response('Not Found',{status:404});
  const isVirtual=id<0; const occurrenceId=Math.abs(id);
  let task:Row|null=null;
  let occurrence:Row|null=null;
  if(isVirtual){
    occurrence=await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status occurrence_status,o.recurrence_rule_id,r.name recurrence_name,r.completion_mode,r.task_id,t.*
      FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id
      JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
      WHERE o.id=? AND o.family_id=? LIMIT 1`).bind(occurrenceId,m.family_id).first<Row>();
    if(!occurrence) return new Response('定期タスクの発生日が見つかりません。',{status:404});
    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(occurrence.task_id)).first<Row>();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=? AND ta.task_id=(SELECT task_id FROM recurrence_rules WHERE id=(SELECT recurrence_rule_id FROM recurrence_occurrences WHERE id=?))').bind(occurrenceId,occurrenceId).first<Row>();
    const mode=String(occurrence.completion_mode||'ANY').toUpperCase();
    const complete=mode==='ALL' ? Number(assigned?.c||0)>0 && Number(done?.c||0)>=Number(assigned?.c||0) : Number(done?.c||0)>0;
    task={...occurrence,id:id,status:complete?'completed':'pending',due_at:`${occurrence.occurrence_date} 00:00:00`,start_at:occurrence.start_at?`${occurrence.occurrence_date} ${String(occurrence.start_at).slice(11,19)}`:null,end_at:occurrence.end_at?`${occurrence.occurrence_date} ${String(occurrence.end_at).slice(11,19)}`:null};
  } else {
    task=await ctx.env.DB.prepare(`SELECT t.*, COALESCE(GROUP_CONCAT(m.name,'、'),'') assignees,
      c.name completer_name, cr.name creator_name
      FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN members m ON m.id=ta.member_id
      LEFT JOIN members c ON c.id=t.completed_by LEFT JOIN members cr ON cr.id=t.created_by
      WHERE t.id=? AND t.family_id=? GROUP BY t.id LIMIT 1`).bind(id,m.family_id).first<Row>();
  }
  if(!task) return new Response('タスクが見つかりません。',{status:404});
  const exceptionOrigin=!isVirtual?await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.recurrence_rule_id,r.name recurrence_name FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.exception_task_id=? AND o.family_id=? LIMIT 1`).bind(id,m.family_id).first<Row>():null;
  const baseTaskId=isVirtual?Number(occurrence?.task_id||0):id;
  const [history,linkedShopping,linkedItems,reminders,assigneeRows]=await Promise.all([
    isVirtual?ctx.env.DB.prepare(`SELECT c.completed_at occurred_at,m.name member_name,'COMPLETED' action FROM recurrence_occurrence_completions c LEFT JOIN members m ON m.id=c.member_id WHERE c.occurrence_id=? ORDER BY c.completed_at DESC`).bind(occurrenceId).all<Row>():ctx.env.DB.prepare(`SELECT h.*,m.name member_name FROM task_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.task_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30`).bind(id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.*,COALESCE((SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id),'') assignees FROM shopping_items s WHERE s.task_id=? AND s.family_id=? ORDER BY s.status,s.category,s.name,s.id`).bind(baseTaskId,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,COALESCE((SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id),'') assignees FROM items i WHERE i.task_id=? AND i.family_id=? ORDER BY i.status,i.name,i.id`).bind(baseTaskId,m.family_id).all<Row>(),
    isVirtual?ctx.env.DB.prepare(`SELECT id,member_id,notify_at,status,message FROM notifications WHERE target_type='task' AND target_id=? AND family_id=? ORDER BY notify_at,id`).bind(baseTaskId,m.family_id).all<Row>():ctx.env.DB.prepare(`SELECT id,member_id,notify_at,status,message FROM notifications WHERE target_type='task' AND target_id=? AND family_id=? ORDER BY notify_at,id`).bind(id,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT m.id,m.name FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=? AND m.active=1 ORDER BY m.id`).bind(baseTaskId).all<Row>()
  ]);
  const assignees=assigneeRows.results.map(r=>String(r.name)).join('、');
  const isEvent=!isVirtual&&String(task.task_kind||'').toLowerCase()==='event';
  const role=String(m.role||'').toUpperCase(); const canEdit=!isVirtual&&(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id);
  const dateForChildren=String(task.start_at||task.due_at||'').slice(0,10);
  const childShoppingHtml=linkedShopping.results.length?`<div class="card"><div class="section-head"><h2>🛒 このタスクの買い物 <span class="small">(${linkedShopping.results.length})</span></h2>${!isVirtual?`<a class="btn gray small" href="/app/shopping_new.php?date=${encodeURIComponent(dateForChildren)}&task_id=${baseTaskId}">＋ 追加</a>`:''}</div>${linkedShopping.results.map(r=>`<div class="row"><label class="shopping-check-row"><input type="checkbox" class="task-child-toggle" data-type="shopping" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span class="${r.status==='completed'?'done':''}">${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>`:esc(r.name)}${r.quantity&&r.quantity!=='1'?` × ${esc(r.quantity)}`:''}</span></label><div class="meta">${[r.category,r.assignees?'担当 '+r.assignees:'',r.due_date?'期限 '+r.due_date:''].filter(Boolean).map(esc).join(' ・ ')}</div></div>`).join('')}</div>`:'';
  const childItemsHtml=`<div class="card"><div class="section-head"><h2>🎒 このタスクの持ち物 <span class="small">(${linkedItems.results.length})</span></h2>${!isVirtual?`<a class="btn gray small" href="/item/new.php?date=${encodeURIComponent(dateForChildren)}&task_id=${baseTaskId}">＋ 追加</a>`:''}</div>${linkedItems.results.map(r=>`<div class="row"><label class="shopping-check-row"><input type="checkbox" class="task-child-toggle" data-type="item" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span class="${r.status==='completed'?'done':''}">${esc(r.name)}</span></label><div class="meta">${esc(r.assignees||'')}</div></div>`).join('')||'<p class="empty">紐付く持ち物はありません。</p>'}</div>`;
  const reminderHtml=reminders.results.length?`<div class="card"><h2>🔔 通知</h2>${reminders.results.map(r=>`<div class="row"><div>${esc(String(r.notify_at||'').slice(0,16))} ・ ${esc(r.status)}</div><div class="meta">${esc(r.message||'')}</div></div>`).join('')}</div>`:'';
  const convertHtml=isVirtual?`<form method="post" action="/task/convert_occurrence.php" class="card"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="occurrence_id" value="${occurrenceId}"><button class="btn">この日だけ通常タスクにする</button></form>`:'';
  const body=`<div class="card"><h1>${isEvent?'📌 イベント詳細':'📝 タスク詳細'}</h1><h2>${esc(task.title)}</h2><div class="meta">${esc(dateForChildren||'指定なし')}${isVirtual?' ・ 🔁 定期タスクの発生日':''}</div>
  ${task.start_at?`<div class="meta">開始：${esc(task.start_at)}${task.end_at?' ・ 終了：'+esc(task.end_at):''}</div>`:''}${task.location?`<div class="meta">場所：${esc(task.location)}</div>`:''}${assignees?`<p>担当：${esc(assignees)}</p>`:''}${task.description?`<div class="sub-card">${esc(task.description).replaceAll('\n','<br>')}</div>`:''}
  ${isEvent?'<p><span class="event-badge">イベント</span> <span class="small">チェック・期限切れ判定の対象外</span></p>':`<p>状態：<strong id="taskStatus">${task.status==='completed'?'完了':'未完了'}</strong></p><label class="checkrow"><input type="checkbox" id="done" ${task.status==='completed'?'checked':''}> 完了</label>`}
  ${canEdit?`<p><a class="btn" href="/task/edit.php?id=${id}">編集</a> ${exceptionOrigin?`<button class="btn danger" id="exceptionDeleteOpen" type="button">削除</button>`:`<button class="btn danger" id="del" type="button">削除</button>`}</p>`:''}<p><a class="btn gray" href="/app/tasks.php?date=${encodeURIComponent(dateForChildren||'')}">戻る</a></p></div>${convertHtml}${childShoppingHtml}${childItemsHtml}${reminderHtml}
  ${isEvent?'':`<div class="card"><h2>完了履歴</h2>${history.results.map(h=>`<div class="row">${esc(h.action)} ・ ${esc(h.member_name||'')} ・ ${esc(h.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div>`}
  ${exceptionOrigin?`<div class="exception-delete-backdrop" id="exceptionDeleteModal" aria-hidden="true"><div class="exception-delete-sheet" role="dialog" aria-modal="true"><div class="section-head"><h2>この日の例外タスクを削除</h2><button class="btn gray small" id="exceptionDeleteClose" type="button">×</button></div><p><strong>${esc(exceptionOrigin.occurrence_date)}</strong> は「${esc(exceptionOrigin.recurrence_name||'定期タスク')}」から通常タスク化した日です。</p><p class="small">削除後の定期タスク側の扱いを選んでください。</p><button class="btn exception-delete-choice" id="exceptionDeleteRestore" type="button">元の定期日に戻す</button><button class="btn danger exception-delete-choice" id="exceptionDeleteExclude" type="button">この日だけ除外したまま削除</button></div></div>`:''}
  <script type="application/json" id="taskViewPayload">${JSON.stringify({csrf:ctx.session.csrfToken||'',id,occurrenceId,toggleType:isVirtual?'recurrence':'task',returnUrl:'/app/tasks.php?date='+encodeURIComponent(dateForChildren||'')}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/task-view.js?v=12.97-wave78"></script>`;
  return html(layout(isEvent?'イベント詳細':'タスク詳細',body,''));
}
function allDayDateEnd(startDate:string,endDate:string):boolean{return startDate!==endDate;}

export async function taskEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx);
  const task=await accessibleTaskById(ctx,id);
  if(!task) return new Response('タスクが見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase();
  if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id)) return new Response('編集権限がありません。',{status:403});

  const [members,shops,items,categories]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name,quantity,url,category,status FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(id,m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,name,status FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(id,m.family_id).all<Row>(),
    ctx.env.DB.prepare(`SELECT DISTINCT s.category FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.category IS NOT NULL AND s.category<>'' ORDER BY s.category`).bind(m.family_id,m.id).all<Row>(),
  ]);

  if(request.method==='POST'){
    const b=await bodyJson(request); await ensureCsrf(ctx,b.csrf);
    const title=String(b.title||'').trim();
    const isEvent=Boolean(b.is_event);
    const makePrivate=!isEvent&&privateTaskRequested(b);
    if(makePrivate&&Number(task.created_by)!==m.id&&!(String(task.visibility_scope)==='PRIVATE'&&Number(task.private_owner_id)===m.id)) throw new Forbidden('他のメンバーが作成した共有タスクを自分専用にはできません。');
    const date=String(b.date||'').trim(); const noDate=!isEvent&&(Boolean(b.no_date)||date==='');
    if(!title) throw new BadRequest('タイトルを入力してください。');
    if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
    if(!noDate&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new BadRequest('日付が不正です。');
    const endDate=String(b.end_date||date).trim();
    if(!noDate&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
    if(!noDate&&endDate<date) throw new BadRequest('終了日は開始日以降にしてください。');
    const st=String(b.start_time||'').trim(), et=String(b.end_time||'').trim();
    const start=noDate?null:(st?`${date} ${st}:00`:null), end=noDate?null:(et?`${endDate} ${et}:00`:(allDayDateEnd(date,endDate)?`${endDate} 23:59:59`:null));
    if(start&&end&&end<start) throw new BadRequest('終了時刻は開始時刻以降にしてください。');
    const reminderRaw=String(b.reminder_at||'').trim();
    const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
    if(reminderRaw&&!reminderAt) throw new BadRequest('通知日時が不正です。');
    const now=nowJst();
    if(reminderAt && reminderAt <= now) throw new BadRequest('通知日時は現在より後の日時を指定してください。');
        const calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
    const allDay=b.all_day?1:0;
    const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
    const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):String(task.calendar_color||'#7c3aed');

    const shopping=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):[];
    const itemsIn=Array.isArray(b.items)?(b.items as unknown[]).slice(0,50):[];
    const validUrl=(u:string)=>{if(!u)return true;try{const x=new URL(u);return x.protocol==='http:'||x.protocol==='https:';}catch{return false;}};
    for(const v of shopping){const u=String((v as any)?.url||'').trim();if(!validUrl(u))throw new BadRequest('買い物URLが不正です。');}

    await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id).run();
    const becamePrivate=makePrivate&&String(task.visibility_scope||'FAMILY')!=='PRIVATE';
    if(becamePrivate){
      await ctx.env.DB.prepare(`DELETE FROM activity_logs WHERE family_id=? AND ((target_type='task' AND target_id=?) OR (target_type='item' AND target_id IN (SELECT id FROM items WHERE family_id=? AND task_id=?)) OR (target_type='shopping' AND target_id IN (SELECT id FROM shopping_items WHERE family_id=? AND task_id=?)))`).bind(m.family_id,id,m.family_id,id,m.family_id,id).run();
    }
    await ctx.env.DB.prepare("UPDATE tasks SET title=?,description=?,due_at=?,start_at=?,end_at=?,location=?,reminder_at=?,calendar_visible=?,all_day=?,calendar_color=?,task_kind=?,visibility_scope=?,private_owner_id=?,completion_mode=CASE WHEN ?='PRIVATE' THEN 'ANY' ELSE completion_mode END,status=CASE WHEN ?=1 THEN 'pending' ELSE status END,completed_by=CASE WHEN ?=1 THEN NULL ELSE completed_by END,completed_at=CASE WHEN ?=1 THEN NULL ELSE completed_at END,updated_at=? WHERE id=? AND family_id=?")
      .bind(title,String(b.description||'')||null,noDate?null:(end||start||`${date} 00:00:00`),start,end,String(b.location||'')||null,reminderAt,calendarVisible,allDay,calendarColor,isEvent?'EVENT':'TASK',makePrivate?'PRIVATE':'FAMILY',makePrivate?m.id:null,makePrivate?'PRIVATE':'FAMILY',isEvent?1:0,isEvent?1:0,isEvent?1:0,now,id,m.family_id).run();
    if(isEvent) await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id).run();

    const assignees=makePrivate?[m.id]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);
    await ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id).run();
    if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    // 担当変更時は、現在の担当外になったメンバーの operational completion を解除する。履歴は保持する。
    await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?)').bind(id,id).run();
    // タスクに紐付く買い物・持ち物の担当者も、タスク編集時に同期する。
    // 個別の子要素編集を妨げないよう、既存の担当者を一旦クリアしてタスク担当者を再設定する。
    const linkedShopsForAssignees=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const linkedItemsForAssignees=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const syncStatements:any[]=[];
    for(const r of linkedShopsForAssignees.results){syncStatements.push(ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(Number(r.id)));if(assignees.length)for(const mid of assignees)syncStatements.push(ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(Number(r.id),mid,m.family_id));}
    for(const r of linkedItemsForAssignees.results){syncStatements.push(ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(Number(r.id)));if(assignees.length)for(const mid of assignees)syncStatements.push(ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(Number(r.id),mid,m.family_id));}
    if(syncStatements.length) await ctx.env.DB.batch(syncStatements);
    if(linkedShopsForAssignees.results.length){
      await ctx.env.DB.batch(linkedShopsForAssignees.results.map(r=>ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN (SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?)').bind(Number(r.id),Number(r.id))));
      await ctx.env.DB.prepare("UPDATE shopping_items SET status=CASE WHEN (SELECT COUNT(*) FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=shopping_items.id)=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=shopping_items.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE task_id=? AND family_id=?").bind(now,id,m.family_id).run();
    }
    if(linkedItemsForAssignees.results.length){
      await ctx.env.DB.batch(linkedItemsForAssignees.results.map(r=>ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id NOT IN (SELECT member_id FROM item_assignees WHERE item_id=?)').bind(Number(r.id),Number(r.id))));
      await ctx.env.DB.prepare("UPDATE items SET status=CASE WHEN (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id)=0 THEN 'pending' WHEN completion_mode='ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id) >= (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id) THEN 'completed' WHEN completion_mode<>'ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE task_id=? AND family_id=?").bind(now,id,m.family_id).run();
    }
    await ctx.env.DB.prepare("UPDATE tasks SET status=CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id)=0 THEN 'pending' WHEN completion_mode='ALL' AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id) >= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id) THEN 'completed' WHEN completion_mode<>'ALL' AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id) > 0 THEN 'completed' ELSE 'pending' END, updated_at=? WHERE id=? AND family_id=?").bind(now,id,m.family_id).run();
    if(reminderAt&&assignees.length){
      const rs=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${assignees.map(()=>'?').join(',')})`).bind(m.family_id,...assignees).all<Row>();
      if(rs.results.length) await ctx.env.DB.batch(rs.results.map(r=>ctx.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(m.family_id,Number(r.id),'task_reminder','task',id,reminderAt,'pending',`【タスク】${title}\n${String(b.description||'').trim()||'詳細なし'}${start?'\n予定: '+start.slice(0,16):''}${end?' ～ '+end.slice(11,16):''}${String(b.location||'').trim()?'\n場所: '+String(b.location).trim():''}`,now)));
    }

    // 子要素はフォームに残っているものを更新し、削除された行だけ消す。
    const existingShopIds=new Set(shops.results.map(r=>Number(r.id)));
    const postedShopIds=new Set<number>();
    const category=String(b.shopping_category||'').trim()||String(shops.results[0]?.category||'').trim()||null;
    for(const v of shopping){
      const o=v as any; const name=String(o?.name||'').trim(); if(!name)continue;
      const qty=String(o?.quantity||'1').trim()||'1'; const url=String(o?.url||'').trim()||null; const sid=Number(o?.id||0);
      if(sid&&existingShopIds.has(sid)){
        postedShopIds.add(sid);
        await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,url=?,category=?,updated_at=? WHERE id=? AND task_id=? AND family_id=?').bind(name,qty,url,category,now,sid,id,m.family_id).run();
      }else{
        const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)")
          .bind(m.family_id,name,qty,category,null,noDate?null:date,m.id,now,now,id,url).run();
        const sid2=Number(sr.meta.last_row_id);
        if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid2,mid,m.family_id)));
      }
    }
    for(const r of shops.results)if(!postedShopIds.has(Number(r.id)))await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(Number(r.id)),...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,Number(r.id),now),ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND task_id=? AND family_id=?').bind(Number(r.id),id,m.family_id)]);

    const existingItemIds=new Set(items.results.map(r=>Number(r.id)));
    const postedItemIds=new Set<number>();
    for(const v of itemsIn){
      const o=v as any; const name=String(o?.name||'').trim(); if(!name)continue; const iid=Number(o?.id||0);
      if(iid&&existingItemIds.has(iid)){
        postedItemIds.add(iid);
        await ctx.env.DB.prepare('UPDATE items SET name=?,due_at=?,updated_at=? WHERE id=? AND task_id=? AND family_id=?').bind(name,noDate?null:`${date} 00:00:00`,now,iid,id,m.family_id).run();
      }else{
        const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?)")
          .bind(m.family_id,name,null,noDate?null:`${date} 00:00:00`,m.id,now,now,id,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();
        const iid2=Number(ir.meta.last_row_id);
        if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid2,mid,m.family_id)));
      }
    }
    for(const r of items.results)if(!postedItemIds.has(Number(r.id)))await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(Number(r.id)),...archiveItemCompletionStatements(ctx.env.DB,m.family_id,Number(r.id),now),ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND task_id=? AND family_id=?').bind(Number(r.id),id,m.family_id)]);

    try { await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); } catch { /* task save succeeds independently of Google */ }
    return redirect(`/task/view.php?id=${id}`);
  }

  const d=String(task.start_at||task.due_at||'').slice(0,10);
  const noDate=!task.start_at && !task.due_at;
  const st=task.start_at?String(task.start_at).slice(11,16):'';
  const et=task.end_at?String(task.end_at).slice(11,16):'';
  const selected=new Set((await ctx.env.DB.prepare('SELECT member_id FROM task_assignees WHERE task_id=?').bind(id).all<Row>()).results.map(x=>Number(x.member_id)));
  const safe=(v:unknown)=>esc(String(v??''));
  const shopRows=shops.results.map(r=>`<div class="product-row task-child-row"><input type="hidden" name="shopping_id[]" value="${r.id}"><input name="shopping_name[]" value="${safe(r.name)}" placeholder="商品名"><input name="shopping_quantity[]" value="${safe(r.quantity||'1')}" placeholder="数量"><input type="url" name="shopping_url[]" value="${safe(r.url||'')}" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button></div>`).join('');
  const itemRows=items.results.map(r=>`<div class="item-entry task-child-row"><input type="hidden" name="item_id[]" value="${r.id}"><input name="item_name[]" value="${safe(r.name)}" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button></div>`).join('');
  const body=`<div class="card form-card"><h1>📝 タスク・イベント編集</h1><form id="taskEditForm">
    <input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}">
    <label>タイトル</label><input name="title" required value="${safe(task.title)}"><label class="checkrow"><input id="editIsEvent" type="checkbox" name="is_event" ${String(task.task_kind||'').toLowerCase()==='event'?'checked':''}><span>イベントとして登録（チェック・期限切れ対象なし）</span></label>
    <label>日付</label><div class="date-option-row"><div><span class="small">開始日</span><input id="editTaskDate" type="date" name="date" value="${safe(d)}"></div><div><span class="small">終了日</span><input id="editTaskEndDate" type="date" name="end_date" value="${safe(String(task.end_at||task.start_at||task.due_at||'').slice(0,10))}"></div><label class="checkrow"><input id="editNoDate" type="checkbox" name="no_date" ${noDate?'checked':''}> <span>期限なし（未整理）</span></label></div>
    <div id="editTimeFields" class="task-time-fields"><div class="field-block"><label>開始時刻</label><input type="time" name="start_time" value="${safe(st)}"></div><div class="field-block"><label>終了時刻</label><input type="time" name="end_time" value="${safe(et)}"></div></div>
    <label>場所</label><input name="location" value="${safe(task.location||'')}">
    <label>説明</label><textarea name="description">${safe(task.description||'')}</textarea><label class="checkrow"><input id="editIsPrivate" type="checkbox" name="is_private" ${String(task.visibility_scope||'FAMILY')==='PRIVATE'?'checked':''}><span>🔒 自分専用</span></label><p class="small">他の家族にはタスク・カレンダー・詳細を表示しません</p>
    <label class="checkrow"><input id="editAllDay" type="checkbox" name="all_day" ${Number(task.all_day??0)?'checked':''}> 終日</label>
    <label class="checkrow"><input id="editCalendarVisible" type="checkbox" name="calendar_visible" ${Number(task.calendar_visible??1)?'checked':''}> カレンダーに表示</label><div id="editCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color">${task.calendar_color&&!['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'].includes(String(task.calendar_color))?`<option value="${safe(task.calendar_color)}" selected>インポート色 ${safe(task.calendar_color)}</option>`:''}<option value="#7c3aed" ${String(task.calendar_color||'#7c3aed')==='#7c3aed'?'selected':''}>紫</option><option value="#2563eb" ${String(task.calendar_color||'')==='#2563eb'?'selected':''}>青</option><option value="#16a34a" ${String(task.calendar_color||'')==='#16a34a'?'selected':''}>緑</option><option value="#ea580c" ${String(task.calendar_color||'')==='#ea580c'?'selected':''}>橙</option><option value="#dc2626" ${String(task.calendar_color||'')==='#dc2626'?'selected':''}>赤</option><option value="#db2777" ${String(task.calendar_color||'')==='#db2777'?'selected':''}>ピンク</option><option value="#0891b2" ${String(task.calendar_color||'')==='#0891b2'?'selected':''}>水色</option><option value="#64748b" ${String(task.calendar_color||'')==='#64748b'?'selected':''}>灰</option></select></div>
    <label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}" ${selected.has(Number(x.id))?'checked':''}> ${safe(x.name)}</label>`).join('')}</div>
    <label>通知日時（任意）</label><input type="datetime-local" name="reminder_at" value="${safe(task.reminder_at?String(task.reminder_at).slice(0,16).replace(' ','T'):'')}"><p class="small">設定すると担当者へ指定日時に詳細を設定した通知方法で通知します。</p>
    <div class="sub-card"><button type="button" class="section-button" id="shopToggle">🛒 買い物を編集</button><div id="shopBox" ${shops.results.length?'':'style="display:none"'}><label>カテゴリー（全商品共通）</label><input name="shopping_category" value="${safe(shops.results[0]?.category||'')}" list="taskShopCategories" placeholder="例：食品"><datalist id="taskShopCategories">${categories.results.map(c=>`<option value="${safe(c.category)}">`).join('')}</datalist><div id="shopRows">${shopRows||`<div class="product-row task-child-row"><input type="hidden" name="shopping_id[]" value="0"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button></div>`}</div><button type="button" class="btn gray small" id="addShopRow">＋ 商品を追加</button></div></div>
    <div class="sub-card"><button type="button" class="section-button" id="itemToggle">🎒 持ち物を編集</button><div id="itemBox" ${items.results.length?'':'style="display:none"'}><div id="itemRows">${itemRows||`<div class="item-entry task-child-row"><input type="hidden" name="item_id[]" value="0"><input name="item_name[]" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button></div>`}</div><button type="button" class="btn gray small" id="addItemRow">＋ 持ち物を追加</button></div></div>
    <button type="submit">保存する</button></form><p><a class="btn gray" href="/task/view.php?id=${id}">戻る</a></p></div>
    <script src="/assets/task-edit.js?v=12.102-wave83"></script>`;
  return html(layout('タスク・イベント編集',body,''));
}

export async function taskApiLegacy(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const id=Number(new URL(request.url).searchParams.get('id')||0); if(!id) return json({ok:false,error:'idが不正です。'},400);
  const task=await accessibleTaskById(ctx,id,'t.created_by,t.visibility_scope,t.private_owner_id'); if(!task) return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id)) return json({ok:false,error:'権限がありません。'},403);
  if(request.method==='DELETE'){
    const csrf=request.headers.get('x-csrf'); await ensureCsrf(ctx,csrf);
    const shops=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const items=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const rules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all<Row>();
    const stm:any[]=[ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id)];
    for(const r of shops.results) stm.push(
      ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(Number(r.id)),
      ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,Number(r.id),nowJst()),
      ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
    );
    for(const r of items.results) stm.push(
      ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(Number(r.id)),
      ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,Number(r.id),nowJst()),
      ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
    );
    for(const r of rules.results) stm.push(...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,Number(r.id),nowJst()),ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id));
    stm.push(ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id));
    await ctx.env.DB.batch(stm); try { await (await import('./google-calendar')).queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); } catch { /* deletion remains authoritative */ } return json({ok:true});
  }
  return json({ok:false,error:'Method Not Allowed'},405);
}

export async function itemEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx); const item=await ctx.env.DB.prepare(`SELECT i.* FROM items i WHERE i.id=? AND i.family_id=? AND (i.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id AND ${taskVisibilitySql('t')}))`).bind(id,m.family_id,m.id).first<Row>(); if(!item) return new Response('持ち物が見つかりません。',{status:404});
  const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id)) return new Response('編集権限がありません。',{status:403});
  const privateParent=Number(item.task_id||0)?await ctx.env.DB.prepare("SELECT id,title,private_owner_id FROM tasks WHERE id=? AND family_id=? AND visibility_scope='PRIVATE' AND private_owner_id=?").bind(Number(item.task_id),m.family_id,m.id).first<Row>():null;
  const tasks=await ctx.env.DB.prepare(`SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status<>'completed' ORDER BY coalesce(start_at,due_at),id`).bind(m.family_id).all<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>(); const assigned=await ctx.env.DB.prepare('SELECT member_id FROM item_assignees WHERE item_id=?').bind(id).all<Row>(); const assignedSet=new Set(assigned.results.map(x=>Number(x.member_id)));
  const history=await ctx.env.DB.prepare('SELECT h.*,m.name member_name FROM item_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.item_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30').bind(id).all<Row>();
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'save'); if(action==='delete'){await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(id),...archiveItemCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(id,m.family_id)]);return redirect('/app/tasks.php');} const name=String(b.name||'').trim();if(!name)throw new BadRequest('持ち物名を入力してください。');const taskId=privateParent?Number(item.task_id):(Number(b.task_id||0)||null);let due: string|null=null;if(taskId){const t=await ctx.env.DB.prepare(`SELECT t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();if(!t)throw new BadRequest('タスクが見つかりません。');due=String(t.start_at||t.due_at||'').slice(0,10)||null;}else if(String(b.due_mode||'none')==='date'){due=String(b.due_date||'').trim()||null;if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new BadRequest('日付が不正です。');}await ctx.env.DB.prepare('UPDATE items SET name=?,memo=?,due_at=?,task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(name,String(b.memo||'')||null,due,taskId,nowJst(),id,m.family_id).run();const aids=privateParent?[Number(privateParent.private_owner_id)]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);await ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(id).run();if(aids.length)await ctx.env.DB.batch(aids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));await ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=? AND member_id NOT IN (SELECT member_id FROM item_assignees WHERE item_id=?)').bind(id,id).run();await ctx.env.DB.prepare("UPDATE items SET status=CASE WHEN (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id)=0 THEN 'pending' WHEN completion_mode='ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>=(SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id) THEN 'completed' WHEN completion_mode<>'ALL' AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>0 THEN 'completed' ELSE 'pending' END,updated_at=? WHERE id=? AND family_id=?").bind(nowJst(),id,m.family_id).run();return redirect(`/app/tasks.php${due?'?date='+encodeURIComponent(due):''}`);}
  const d=String(item.due_at||'').slice(0,10); const body=`<div class="card"><h1>🎒 持ち物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="id" value="${id}"><label>持ち物</label><input name="name" required value="${esc(item.name)}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>関連タスク</label><select name="task_id" ${privateParent?'disabled':''}>${privateParent?`<option value="${privateParent.id}" selected>🔒 ${esc(privateParent.title)}</option>`:`<option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}" ${Number(item.task_id)===Number(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}`}</select>${privateParent?`<input type="hidden" name="task_id" value="${privateParent.id}"><p class="small">自分専用タスクとの紐付けは編集時に解除できません。</p>`:''}<label>日付（タスクを指定しない場合）</label><input type="date" name="due_date" value="${esc(d)}"><label>担当者</label>${privateParent?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':`<div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}" ${assignedSet.has(Number(x.id))?'checked':''}> ${esc(x.name)}</label>`).join('')}</div>`}<button name="action" value="save">保存する</button></form><div class="card"><h2>完了履歴</h2>${history.results.map(h=>`<div class="row">${esc(h.action)} ・ ${esc(h.member_name||'')} ・ ${esc(h.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div><form method="post" onsubmit="return confirm('この持ち物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;return html(layout('持ち物編集',body,''));
}

export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const m=requireMember(ctx); const item=await ctx.env.DB.prepare(`SELECT s.* FROM shopping_items s WHERE s.id=? AND s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${taskVisibilitySql('t')}))`).bind(id,m.family_id,m.id).first<Row>(); if(!item) return new Response('買い物が見つかりません。',{status:404}); const role=String(m.role||'').toUpperCase(); if(!(role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id)) return new Response('編集権限がありません。',{status:403}); const privateParent=Number(item.task_id||0)?await ctx.env.DB.prepare("SELECT id,title,private_owner_id FROM tasks WHERE id=? AND family_id=? AND visibility_scope='PRIVATE' AND private_owner_id=?").bind(Number(item.task_id),m.family_id,m.id).first<Row>():null;
  const tasks=await ctx.env.DB.prepare(`SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status<>'completed' ORDER BY coalesce(start_at,due_at),id`).bind(m.family_id).all<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const assigned=await ctx.env.DB.prepare('SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?').bind(id).all<Row>();
  const history=await ctx.env.DB.prepare('SELECT h.*,m.name member_name FROM shopping_completion_history h LEFT JOIN members m ON m.id=h.member_id WHERE h.shopping_item_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30').bind(id).all<Row>();
  const assignedSet=new Set(assigned.results.map(x=>Number(x.member_id)));
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'save');if(action==='delete'){await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(id),...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,id,nowJst()),ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(id,m.family_id)]);return redirect('/app/shopping.php');}const name=String(b.name||'').trim();if(!name)throw new BadRequest('商品名を入力してください。');const rawUrl=String(b.url||'').trim();if(rawUrl){try{const u=new URL(rawUrl);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{throw new BadRequest('URLが不正です。');}}const qty=String(b.quantity||'1').trim()||'1';const taskId=privateParent?Number(item.task_id):(Number(b.task_id||0)||null);let due=String(b.due_date||'').trim()||null;if(taskId){const t=await ctx.env.DB.prepare(`SELECT t.start_at,t.due_at FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first<Row>();if(!t)throw new BadRequest('タスクが見つかりません。');due=String(t.start_at||t.due_at||'').slice(0,10)||null;}await ctx.env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,category=?,memo=?,due_date=?,task_id=?,url=?,updated_at=? WHERE id=? AND family_id=?').bind(name,qty,String(b.category||'')||null,String(b.memo||'')||null,due,taskId,rawUrl||null,nowJst(),id,m.family_id).run();const aids=privateParent?[Number(privateParent.private_owner_id)]:(Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[]);await ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(id).run();if(aids.length)await ctx.env.DB.batch(aids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));await ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN (SELECT member_id FROM shopping_assignees WHERE shopping_item_id=?)').bind(id,id).run();await ctx.env.DB.prepare("UPDATE shopping_items SET status=CASE WHEN (SELECT COUNT(*) FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=shopping_items.id)=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM shopping_completions sc JOIN shopping_assignees sa ON sa.shopping_item_id=sc.shopping_item_id AND sa.member_id=sc.member_id JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sc.shopping_item_id=shopping_items.id)>0 THEN 'completed' ELSE 'pending' END,updated_at=? WHERE id=? AND family_id=?").bind(nowJst(),id,m.family_id).run();return redirect('/app/shopping.php');}
  const body=`<div class="card"><h1>🛒 買い物編集</h1><form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>商品名</label><input name="name" required value="${esc(item.name)}"><label>数量</label><input type="text" name="quantity" value="${esc(item.quantity||'1')}"><label>カテゴリー</label><input name="category" value="${esc(item.category||'')}"><label>URL</label><input type="url" name="url" value="${esc(item.url||'')}"><label>メモ</label><textarea name="memo">${esc(item.memo||'')}</textarea><label>担当者</label>${privateParent?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}" ${assignedSet.has(Number(x.id))?'checked':''}> ${esc(x.name)}</label>`).join('')}<label>紐づくタスク</label><select name="task_id" ${privateParent?'disabled':''}>${privateParent?`<option value="${privateParent.id}" selected>🔒 ${esc(privateParent.title)}</option>`:`<option value="0">タスクなし</option>${tasks.results.map(t=>`<option value="${t.id}" ${Number(item.task_id)===Number(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}`}</select>${privateParent?`<input type="hidden" name="task_id" value="${privateParent.id}"><p class="small">自分専用タスクとの紐付けは編集時に解除できません。</p>`:''}<label>期限日</label><input type="date" name="due_date" value="${esc(item.due_date||'')}"><button name="action" value="save">保存する</button></form><div class="card"><h2>完了履歴</h2>${history.results.map(h=>`<div class="row">${esc(h.action)} ・ ${esc(h.member_name||'')} ・ ${esc(h.occurred_at||'')}</div>`).join('')||'<p>履歴はありません。</p>'}</div><form method="post" onsubmit="return confirm('この買い物を削除しますか？')"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="btn danger" name="action" value="delete">削除</button></form></div>`;return html(layout('買い物編集',body,''));
}

export async function settings(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const role=String(m.role||'').toUpperCase(); const isAdmin=role==='OWNER'||role==='ADMIN';
  if(request.method==='POST'){const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const action=String(b.action||'');
    if(action==='family_timezone'){if(!isAdmin)return json({ok:false,error:'管理者権限が必要です。'},403);const timezone=String(b.timezone||'');if(!validateTimezone(timezone)||!FAMILY_TIMEZONE_OPTIONS.includes(timezone as any))return json({ok:false,error:'タイムゾーンが不正です。'},400);await ctx.env.DB.prepare('UPDATE families SET timezone=?,updated_at=? WHERE id=?').bind(timezone,nowJst(),m.family_id).run();await logActivity(ctx,'UPDATED','family',m.family_id,{setting:'timezone',timezone});return json({ok:true});}
    if(action==='member_permission'){if(!isAdmin)return json({ok:false,error:'管理者権限が必要です。'},403);const target=Number(b.member_id||0),granted=Boolean(b.granted),targetMember=await ctx.env.DB.prepare('SELECT id,role FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(target,m.family_id).first<Row>();if(!targetMember)return json({ok:false,error:'メンバーが見つかりません。'},404);if(granted)await ctx.env.DB.prepare("INSERT OR IGNORE INTO member_permissions(family_id,member_id,permission_key,granted_by,created_at) VALUES(?,?,'MANAGE_QUICK_CHORES',?,?)").bind(m.family_id,target,m.id,nowJst()).run();else await ctx.env.DB.prepare("DELETE FROM member_permissions WHERE family_id=? AND member_id=? AND permission_key='MANAGE_QUICK_CHORES'").bind(m.family_id,target).run();await logActivity(ctx,granted?'PERMISSION_GRANTED':'PERMISSION_REVOKED','member',target,{permission_key:'MANAGE_QUICK_CHORES'});return json({ok:true});}
    if(action==='profile'){const name=String(b.name||'').trim();if(!name)throw new BadRequest('名前を入力してください。');await ctx.env.DB.prepare('UPDATE members SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(name,nowJst(),m.id,m.family_id).run();ctx.member={...m,name};return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);}
    if(action==='member_toggle'||action==='member_delete'){
      if(!isAdmin) return json({ok:false,error:'管理者権限が必要です。'},403);
      const target=Number(b.member_id||0);
      if(target===m.id||!target)return json({ok:false,error:'対象が不正です。'},400);
      const targetMember=await ctx.env.DB.prepare('SELECT id,role,active,deleted_at FROM members WHERE id=? AND family_id=?').bind(target,m.family_id).first<Row>();
      if(!targetMember)return json({ok:false,error:'メンバーが見つかりません。'},404);
      if(String(targetMember.role).toUpperCase()==='OWNER')return json({ok:false,error:'OWNERは変更できません。'},400);
      if(action==='member_toggle'){
        if(targetMember.deleted_at) return json({ok:false,error:'削除済みメンバーは再開できません。'},400);
        const nextActive=Number(targetMember.active)?0:1;
        const now=nowJst();
        await ctx.env.DB.prepare('UPDATE members SET active=?,updated_at=? WHERE id=? AND family_id=?').bind(nextActive,now,target,m.family_id).run();
        if(!nextActive) {
          await ctx.env.DB.batch([
            ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE member_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM task_assignees WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM item_assignees WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM task_completions WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM item_completions WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare("UPDATE tasks SET status=CASE WHEN completion_mode='ALL' THEN CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id)>0 AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id)>= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id) THEN 'completed' ELSE 'pending' END ELSE CASE WHEN (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id)>0 THEN 'completed' ELSE 'pending' END END, completed_by=NULL, completed_at=NULL, updated_at=? WHERE family_id=?").bind(now,m.family_id),
            ctx.env.DB.prepare("UPDATE items SET status=CASE WHEN completion_mode='ALL' THEN CASE WHEN (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id)>0 AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>= (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id) THEN 'completed' ELSE 'pending' END ELSE CASE WHEN (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>0 THEN 'completed' ELSE 'pending' END END, completed_by=NULL, completed_at=NULL, updated_at=? WHERE family_id=?").bind(now,m.family_id)
          ]);
        }
        await logActivity(ctx,nextActive?'MEMBER_REACTIVATED':'MEMBER_DEACTIVATED','member',target);
        return json({ok:true});
      }
      if(targetMember.deleted_at) return json({ok:false,error:'すでに削除済みです。'},400);
      // Members are retained as tombstones so completion history, assignee history,
      // creator/completer references and activity logs remain auditable. This is a
      // logical delete, not a physical DELETE, and therefore does not cascade away history.
      const now=nowJst();
      await ctx.env.DB.batch([
        ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE member_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_assignees WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_completions WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_completions WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('UPDATE members SET active=0,notification_enabled=0,deleted_at=?,updated_at=? WHERE id=? AND family_id=?').bind(now,now,target,m.family_id)
      ]);
      await logActivity(ctx,'MEMBER_DELETED','member',target);
      return json({ok:true});
    }
    if(action==='notification'){const enabled=b.enabled?1:0;await ctx.env.DB.prepare('UPDATE members SET notification_enabled=?,updated_at=? WHERE id=? AND family_id=?').bind(enabled,nowJst(),m.id,m.family_id).run();return json({ok:true});}
  }
  const family=await ctx.env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(m.family_id).first<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name,role,active,notification_enabled FROM members WHERE family_id=? AND deleted_at IS NULL ORDER BY id').bind(m.family_id).all<Row>();
  const ns=await ctx.env.DB.prepare('SELECT * FROM notification_settings WHERE family_id=? AND member_id=?').bind(m.family_id,m.id).first<Row>();
  const recurring=await ctx.env.DB.prepare('SELECT id,name AS title,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active FROM recurrence_rules WHERE family_id=? ORDER BY active DESC,id DESC').bind(m.family_id).all<Row>();
  const body=`<div class="card"><h1>⚙️ 管理</h1><h2>プロフィール</h2><form id="profile"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input name="name" value="${esc(m.name)}" required><button>保存</button></form></div>${isAdmin?`<div class="card"><h2>家族設定</h2><form id="familyTimezone"><label>タイムゾーン</label><select name="timezone">${FAMILY_TIMEZONE_OPTIONS.map(z=>`<option value="${z}" ${String(family?.timezone||DEFAULT_FAMILY_TIMEZONE)===z?'selected':''}>${z==='Asia/Tokyo'?'日本 / ':''}${z}</option>`).join('')}</select><p class="small">タイムゾーンを変更しても、既存の記録日時は自動変換されません。</p><button>保存する</button></form></div>`:''}<div class="card settings-links"><div class="section-link"><div><h2>🔗 外部連携</h2><p class="small">Google Home・Google Calendar・Family AIを分けて管理します。</p></div><a class="btn gray" href="/app/settings_integrations.php">開く</a></div><div class="section-link"><div><h2>👨‍👩‍👧 家族メンバー</h2><p class="small">家族メンバーと招待を管理します。</p></div><a class="btn" href="/app/settings_members.php">開く</a></div><div class="section-link"><div><h2>🐣 家族ログ管理</h2><p class="small">記録対象・表示項目・インポートを管理します。</p></div><a class="btn gray" href="/app/settings_family_log.php">開く</a></div><div class="section-link"><div><h2>📋 投稿管理</h2><p class="small">タスク・持ち物・買い物・伝言を確認します。</p></div><a class="btn gray" href="/app/settings_content.php">開く</a></div><div class="section-link"><div><h2>📅 カレンダーインポート</h2><p class="small">ICS / TimeTreeの予定を安全に確認して取り込みます。</p></div><a class="btn gray" href="/app/calendar_import.php">開く</a></div><div class="section-link"><div><h2>🔔 通知設定</h2><p class="small">LINE / Web Pushの通知方法と対象メンバーを設定します。</p></div><a class="btn gray" href="/app/settings_notifications.php">開く</a></div><div class="section-link"><div><h2>🩺 データ診断</h2><p class="small">通知・定期タスク・削除履歴・紐付けの整合性を確認します。</p></div><a class="btn gray" href="/app/settings_diagnostics.php">開く</a></div><div class="section-link"><div><h2>🔁 定期タスク</h2><p class="small">毎日・毎週・毎月などの繰り返しを設定します。</p></div><a class="btn gray" href="/app/recurring.php">開く</a></div><div class="section-link"><div><h2>📊 家族の活動ログ</h2><p class="small">タスク完了や家族ログの記録・編集を、誰がいつ行ったか確認します。</p></div><a class="btn gray" href="/app/logs.php">開く</a></div></div><script type="application/json" id="settingsPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/settings.js?v=12.97-wave78"></script>`;
  return html(layout('管理',body,'/app/settings.php'));
}


export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{
  const m=requireMember(ctx); const d=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'';
  const [tasks,members]=await Promise.all([ctx.env.DB.prepare(`SELECT id,title,start_at,due_at,visibility_scope FROM tasks t WHERE family_id=? AND status<>'completed' AND (visibility_scope='FAMILY' OR (id=? AND ${taskVisibilitySql('t')})) ORDER BY coalesce(start_at,due_at),id LIMIT 200`).bind(m.family_id,selectedTaskId,m.id).all<Row>(),ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>()]);
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>🛒 買い物を追加</h1></div><a class="btn gray" href="/app/shopping.php">戻る</a></div>${shoppingBatchForm(ctx,tasks.results,d,members.results,selectedTaskId)}`;
  return html(layout('買い物を追加',body,'/app/shopping.php'));
}

export async function messageNew(ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx); const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>💬 伝言</h1></div><a class="btn gray" href="/app/messages.php">戻る</a></div><div class="card form-card"><form id="messageNew"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" maxlength="5000" required autofocus placeholder="家族への伝言を入力してください。"></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">指定すると宛先へその日時に伝言内容を設定した通知方法で通知します。</p><button>伝言する</button></form></div><script src="/assets/message-new.js?v=12.97-wave78"></script>`;
  return html(layout('伝言',body,'/app/messages.php'));
}

export async function settingsMembers(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx),role=String(m.role||'').toUpperCase(); if(role!=='OWNER'&&role!=='ADMIN')return new Response('管理者権限が必要です。',{status:403});
  const [members,invitations]=await Promise.all([
    ctx.env.DB.prepare("SELECT m.id,m.name,m.member_type,m.role,m.active,m.deleted_at,m.created_at,EXISTS(SELECT 1 FROM member_permissions p WHERE p.family_id=m.family_id AND p.member_id=m.id AND p.permission_key='MANAGE_QUICK_CHORES') manage_quick_chores FROM members m WHERE m.family_id=? ORDER BY m.id").bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT i.id,i.expires_at,i.used_at,i.created_at,i.family_log_subject_id,c.name created_by_name,u.name used_by_name,s.name subject_name FROM family_invitations i LEFT JOIN members c ON c.id=i.created_by LEFT JOIN members u ON u.id=i.used_by LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id WHERE i.family_id=? ORDER BY i.id DESC LIMIT 20').bind(m.family_id).all<Row>()
  ]);
  const now=nowJst();
  const invitationRows=invitations.results.map(i=>{const used=Boolean(i.used_at),active=!used&&String(i.expires_at||'')>now;const status=used?'使用済み':active?'有効':'期限切れ/取消済み';const subject=i.subject_name?`<div class="meta invite-subject-link">🐣 ${esc(i.subject_name)} のLINE本登録</div>`:'';return `<div class="invite-history-row"><div><strong>${status}</strong>${subject}<div class="meta">発行 ${esc(String(i.created_at||'').slice(0,16))}${i.created_by_name?' ・ '+esc(i.created_by_name):''}</div><div class="meta">期限 ${esc(String(i.expires_at||'').slice(0,16))}${used&&i.used_at?' ・ 使用 '+esc(String(i.used_at).slice(0,16)):''}${used&&i.used_by_name?' ・ '+esc(i.used_by_name):''}</div></div>${active?`<button type="button" class="btn danger small invite-revoke" data-id="${i.id}">取消</button>`:''}</div>`}).join('')||'<p class="empty">発行履歴はありません。</p>';
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>👨‍👩‍👧 家族メンバー</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card member-list">${members.results.map(x=>`<div class="member-row"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.member_type||'ADULT')} / ${esc(x.role||'MEMBER')} / ${x.deleted_at?'削除済み':(Number(x.active)?'有効':'停止中')}</div>${String(x.role||'').toUpperCase()==='MEMBER'&&!x.deleted_at?`<label class="checkrow small"><input type="checkbox" class="quick-chore-permission" data-id="${x.id}" ${Number(x.manage_quick_chores)?'checked':''}> ちょこっと家事項目を管理</label>`:''}</div>${Number(x.id)!==m.id&&String(x.role||'').toUpperCase()!=='OWNER'&&!x.deleted_at?`<div class="actions"><button class="btn gray small member-toggle" data-id="${x.id}">${Number(x.active)?'停止':'再開'}</button><button class="btn danger small member-del" data-id="${x.id}">削除</button></div>`:''}</div>`).join('')}</div><div class="card"><h2>招待</h2><div class="invite-guide"><strong>招待前の流れ</strong><ol><li>招待相手に Family TODO LINE 公式アカウントを友だち追加してもらう</li><li>7日間有効の招待リンクを発行してLINEで送る</li><li>相手はLINE内でリンクを開き、名前を確認して参加する</li></ol><p class="small">招待リンク発行時に公式アカウント情報を自動取得し、友だち追加URLも一緒に共有できます。</p></div><button id="invite" class="btn">招待リンクを発行</button><div id="inviteOut"></div><details class="invite-history" open><summary>発行済み招待リンク</summary>${invitationRows}</details></div><script type="application/json" id="settingsMembersPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/settings-members.js?v=12.97-wave78"></script>`;
  return html(layout('家族メンバー',body,'/app/settings.php'));
}

export async function webPushApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);
  const action=new URL(request.url).pathname.split('/').pop()||'';
  const now=nowJst();
  if(action==='subscribe'){
    if(!webPushConfigured(ctx.env))return json({ok:false,error:'Web Push用VAPID鍵が未設定です。'},503);
    const sub=(b.subscription&&typeof b.subscription==='object'&&!Array.isArray(b.subscription))?b.subscription as Record<string,unknown>:{};
    const keys=(sub.keys&&typeof sub.keys==='object'&&!Array.isArray(sub.keys))?sub.keys as Record<string,unknown>:{};
    const endpoint=String(sub.endpoint||'').trim(),p256dh=String(keys.p256dh||'').trim(),auth=String(keys.auth||'').trim();
    if(!endpoint||!p256dh||!auth)throw new BadRequest('Push購読情報が不正です。');
    let parsed:URL;try{parsed=new URL(endpoint)}catch{throw new BadRequest('Push endpointが不正です。');}
    if(parsed.protocol!=='https:'||endpoint.length>2500||p256dh.length>500||auth.length>500)throw new BadRequest('Push購読情報が不正です。');
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

export async function settingsNotifications(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx),role=String(m.role||'').toUpperCase(),isAdmin=role==='OWNER'||role==='ADMIN';
  const members=await ctx.env.DB.prepare("SELECT id,name,role,active,notification_enabled,COALESCE(notification_channel,'LINE') notification_channel FROM members WHERE family_id=? AND deleted_at IS NULL ORDER BY id").bind(m.family_id).all<Row>();
  if(request.method==='POST'){
    const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);
    const targetIds=isAdmin&&Array.isArray(b.enabled_members)?(b.enabled_members as unknown[]).map(Number).filter(n=>n>0):[m.id];
    const channel=String(b.notification_channel||m.notification_channel||'LINE').toUpperCase();
    if(!['LINE','WEB_PUSH'].includes(channel))throw new BadRequest('通知方法が不正です。');
    if(channel==='WEB_PUSH'){
      const pushCount=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1').bind(m.id,m.family_id).first<Row>();
      if(Number(pushCount?.c||0)===0)throw new BadRequest('先にこの端末でWeb Pushを有効化してください。');
    }
    if(isAdmin){
      await ctx.env.DB.batch(members.results.map(x=>ctx.env.DB.prepare('UPDATE members SET notification_enabled=?,updated_at=? WHERE id=? AND family_id=?').bind(targetIds.includes(Number(x.id))?1:0,nowJst(),Number(x.id),m.family_id)));
      await ctx.env.DB.prepare('UPDATE members SET notification_channel=?,updated_at=? WHERE id=? AND family_id=?').bind(channel,nowJst(),m.id,m.family_id).run();
    }else{
      const enabled=Boolean(b.enabled)?1:0;
      const now=nowJst();
      await ctx.env.DB.prepare('UPDATE members SET notification_enabled=?,notification_channel=?,updated_at=? WHERE id=? AND family_id=?').bind(enabled,channel,now,m.id,m.family_id).run();
      if(!enabled) await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE member_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,m.id,m.family_id).run();
    }
    if(isAdmin){
      const now=nowJst();
      const disabledIds=members.results.filter(x=>!targetIds.includes(Number(x.id))).map(x=>Number(x.id));
      if(disabledIds.length) await ctx.env.DB.prepare(`UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND status IN ('pending','retry') AND member_id IN (${disabledIds.map(()=>'?').join(',')})`).bind(now,m.family_id,...disabledIds).run();
    }
    return json({ok:true});
  }
  const selfRow=members.results.find(x=>Number(x.id)===m.id)||{};
  const pushCount=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1').bind(m.id,m.family_id).first<Row>();
  const devices=await ctx.env.DB.prepare('SELECT id,user_agent,enabled,last_success_at,failure_count,last_error,updated_at FROM web_push_subscriptions WHERE member_id=? AND family_id=? ORDER BY id DESC').bind(m.id,m.family_id).all<Row>();
  const deviceName=(ua:unknown)=>{const x=String(ua||'');if(/iPhone/i.test(x))return 'iPhone / Safari PWA';if(/iPad/i.test(x))return 'iPad / Safari PWA';if(/Android/i.test(x)&&/Chrome/i.test(x))return 'Android / Chrome';if(/Chrome/i.test(x))return 'Desktop / Chrome';return 'Unknown device';};
  const deviceRows=devices.results.map((d,i)=>`<div class="row push-device" data-push-device="${d.id}"><strong>端末 ${i+1}：${esc(deviceName(d.user_agent))}</strong><div class="meta">${Number(d.enabled)?'有効':'無効'} ・ 最終成功 ${esc(d.last_success_at||'なし')} ・ 失敗 ${esc(d.failure_count||0)}回</div><div class="meta">最終エラー ${esc(d.last_error||'なし')} ・ 更新 ${esc(d.updated_at||'')}</div><button type="button" class="btn danger small push-remove" data-id="${d.id}">この登録を解除</button></div>`).join('')||'<p class="empty">登録済み端末はありません。</p>';
  const pushConfigured=webPushConfigured(ctx.env),pushPublicKey=webPushPublicKey(ctx.env),channel=String(selfRow.notification_channel||'LINE');
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||'',pushConfigured,pushPublicKey,pushCount:Number(pushCount?.c||0),channel}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>🔔 通知設定</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card form-card"><form id="notificationForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}">${isAdmin?`<label>通知を有効にするメンバー</label><div class="choice-list">${members.results.map(x=>`<label class="checkrow"><input type="checkbox" name="enabled_members" value="${x.id}" ${Number(x.notification_enabled??1)?'checked':''}><span>${esc(x.name)}</span></label>`).join('')}</div>`:`<label class="checkrow"><input type="checkbox" name="enabled" ${Number(m.notification_enabled??1)?'checked':''}><span>通知を有効にする</span></label>`}<label>自分の通知方法</label><select name="notification_channel"><option value="LINE" ${channel==='LINE'?'selected':''}>LINE公式アカウント</option><option value="WEB_PUSH" ${channel==='WEB_PUSH'?'selected':''}>Web Push（PWA）</option></select><p class="small">Web Pushを選ぶとLINEのメッセージ通数を消費しません。通知日時はタスク・伝言ごとに指定します。</p><button>保存する</button></form></div><div class="card push-settings-card"><h2>📲 Web Push</h2><p class="small">iPhone/iPadではSafariから「ホーム画面に追加」したFamily TODOを開き、この画面のボタンを押して通知を許可してください。LINE内ブラウザのままではWeb Pushを有効化できない場合があります。</p><div id="pushStatus" class="notice" aria-live="polite">Web Pushの状態を確認しています…</div><div class="actions"><button type="button" class="btn" id="pushEnable" ${pushConfigured?'':'disabled'}>この端末で有効化</button><button type="button" class="btn gray" id="pushTest" ${pushConfigured?'':'disabled'}>テスト通知</button><button type="button" class="btn danger" id="pushDisable">この端末を解除</button></div>${pushConfigured?'':`<div class="error">VAPID鍵が未設定です。管理者がサーバー設定を完了すると利用できます。</div>`}<h3>自分の登録端末</h3><div id="pushDevices">${deviceRows}</div></div><script type="application/json" id="notificationSettingsPayload">${payload}</script><script src="/assets/settings-notifications.js?v=12.104-wave85"></script>`;
  return html(layout('通知設定',body,'/app/settings.php'));
}

const FAMILY_LOG_TYPE_META:Record<string,{icon:string;label:string}>={
  MILK:{icon:'🍼',label:'ミルク'},BREASTFEED:{icon:'🤱',label:'母乳'},MEAL:{icon:'🍚',label:'食事'},DIAPER:{icon:'🧷',label:'おむつ'},
  SLEEP:{icon:'😴',label:'睡眠'},BATH:{icon:'🛁',label:'お風呂'},TEMPERATURE:{icon:'🌡️',label:'体温'},MEDICINE:{icon:'💊',label:'薬'},VACCINE:{icon:'💉',label:'予防接種'},
  CONDITION:{icon:'🙂',label:'体調'},WEIGHT:{icon:'⚖️',label:'体重'},HEIGHT:{icon:'📏',label:'身長'},BLOOD_PRESSURE:{icon:'🫀',label:'血圧'},
  EXERCISE:{icon:'🏃',label:'運動'},WATER:{icon:'💧',label:'水分'},TOILET:{icon:'🚻',label:'トイレ'},WALK:{icon:'🐕',label:'散歩'},TIMER:{icon:'⏱',label:'タイマー'},HOUSEWORK:{icon:'🧹',label:'ちょこっと家事'},MEMO:{icon:'📝',label:'メモ'}
};
const FAMILY_LOG_TYPES=Object.keys(FAMILY_LOG_TYPE_META);
const FAMILY_LOG_SUBJECT_TYPES=FAMILY_LOG_TYPES.filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
const FAMILY_LOG_DETAILS:Record<string,string>={
  LEFT:'左',RIGHT:'右',BOTH:'両方',BREAKFAST:'朝食',LUNCH:'昼食',DINNER:'夕食',SNACK:'おやつ',OTHER:'その他',WET:'おしっこ',DIRTY:'うんち',BATH:'お風呂',SHOWER:'シャワー',
  GOOD:'良好',NORMAL:'ふつう',TIRED:'疲れ気味',SICK:'不調',WALK:'歩く',RUN:'走る',STRENGTH:'筋トレ',STRETCH:'ストレッチ',PLAY:'遊び'
};
const FAMILY_LOG_SUBJECT_META:Record<string,{icon:string;label:string}>={
  BABY:{icon:'👶',label:'赤ちゃん'},CHILD:{icon:'🧒',label:'子ども'},ADULT:{icon:'👤',label:'大人'},PET:{icon:'🐾',label:'ペット'},OTHER:{icon:'⭐',label:'その他'}
};
const FAMILY_LOG_DEFAULT_TYPES:Record<string,string[]>={
  BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
  CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
  ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
  PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
  OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT']
};

function familyLogSubjectKind(value:unknown):string{
  const kind=String(value||'ADULT').toUpperCase();
  return Object.prototype.hasOwnProperty.call(FAMILY_LOG_SUBJECT_META,kind)?kind:'OTHER';
}
function familyLogDefaultTypes(kind:unknown):string[]{
  return [...(FAMILY_LOG_DEFAULT_TYPES[familyLogSubjectKind(kind)]||FAMILY_LOG_DEFAULT_TYPES.OTHER)];
}
function familyLogEnabledTypes(subject:Row|undefined|null):string[]{
  if(!subject)return [...FAMILY_LOG_TYPES];
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed)){
        const out=[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))];
        if(out.length)return out;
      }
    }catch{}
  }
  return familyLogDefaultTypes(subject.subject_kind);
}
function familyLogOverviewQuickTypes(subject:Row|undefined|null):string[]{
  if(!subject||Number(subject.show_on_family_overview)!==1)return [];
  const raw=String(subject.overview_quick_types_json||'').trim();
  if(!raw)return [];
  try{
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))]:[];
  }catch{return [];}
}
const SLEEP_TIMER_WARNING_MINUTES=12*60;
const SLEEP_TIMER_CONFIRM_MINUTES=16*60;
const SLEEP_TIMER_MAX_ADJUST_MINUTES=48*60;
function familyLogJstMs(value:unknown):number{
  const normalized=familyLogDateTime(value);
  return Date.parse(`${normalized.replace(' ','T')}+09:00`);
}
function familyLogSubjectIcon(subject:Row|undefined|null):string{
  if(subject?.icon)return String(subject.icon);
  return FAMILY_LOG_SUBJECT_META[familyLogSubjectKind(subject?.subject_kind)]?.icon||'👤';
}
async function ensureFamilyLogMemberSubjects(ctx:AppContext,familyId:number,createdBy:number):Promise<void>{
  const now=nowJst();
  await ctx.env.DB.prepare(`INSERT INTO family_log_subjects(family_id,member_id,name,subject_kind,birth_date,icon,active,created_by,created_at,updated_at,enabled_types_json,auto_complete_linked_task)
    SELECT mm.family_id,mm.id,mm.name,
      CASE
        WHEN upper(COALESCE(mm.member_type,'ADULT'))='BABY' THEN 'BABY'
        WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('CHILD','KID') THEN 'CHILD'
        ELSE 'ADULT'
      END,
      NULL,mm.icon,1,?,COALESCE(mm.created_at,?),?,NULL,
      CASE WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('BABY','CHILD','KID') THEN 1 ELSE 0 END
    FROM members mm
    WHERE mm.family_id=? AND mm.active=1
      AND NOT EXISTS(
        SELECT 1 FROM family_log_subjects s
        WHERE s.family_id=mm.family_id AND s.member_id=mm.id
      )`).bind(createdBy,now,now,familyId).run();
}

function familyLogDateTime(value:unknown):string{
  const raw=String(value??'').trim().replace('T',' ');
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw))throw new BadRequest('記録日時が不正です。');
  return raw.length===16?`${raw}:00`:raw;
}

function familyLogDefaultAutoComplete(kind:unknown):number{
  return ['BABY','CHILD','PET'].includes(familyLogSubjectKind(kind))?1:0;
}
export function supportsDedicatedSleep(kind:unknown):boolean{
  return ['BABY','CHILD'].includes(familyLogSubjectKind(kind));
}

function externalActionContext(env:Env,member:CurrentMember):AppContext{return {env,member,request:new Request('https://internal.invalid/'),session:{iat:0}};}
export async function recordQuickChoreDomain(env:Env,member:CurrentMember,id:number):Promise<{ok:boolean;id?:number}>{
  const chore=await env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE id=? AND family_id=? AND active=1').bind(id,member.family_id).first<Row>();
  if(!chore)return {ok:false};const now=nowJst();
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at,quick_chore_id) VALUES(?,NULL,'HOUSEWORK',?,?,?,?,?,?,?,?,?,?,?, ?,NULL,?)").bind(member.family_id,now,null,null,null,null,String(chore.name),null,null,null,member.id,now,now,id).run();
  const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'HOUSEWORK',occurred_at:now,value_text:String(chore.name),quick_chore_id:id});return {ok:true,id:logId};
}
export async function createExternalShoppingItemDomain(env:Env,member:CurrentMember,input:{name:string;quantity:number}):Promise<{ok:boolean;id?:number}>{
  const name=String(input.name||'').trim();
  if(!name||name.length>255||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>999)return {ok:false};
  const n=nowJst();
  const r=await env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,NULL,NULL,'pending',?,?,?,NULL,NULL)").bind(member.family_id,name,String(input.quantity),member.id,n,n).run();
  const id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};
  await env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(id,member.id,member.family_id).run();
  return {ok:true,id};
}
export type ExternalFamilyLogPreset='NOW'|'MINUS_60';
export async function recordExternalFamilyLogDomain(env:Env,member:CurrentMember,subjectId:number,detailCode:'WET'|'DIRTY',preset:ExternalFamilyLogPreset):Promise<{ok:boolean;id?:number;operation?:string;occurred_at?:string}>{
  if(!['NOW','MINUS_60'].includes(preset)||!['WET','DIRTY'].includes(detailCode))return {ok:false};
  const subject=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,member.family_id).first<Row>();
  if(!subject)return {ok:false};
  const kind=String(subject.subject_kind),logType=kind==='BABY'?'DIAPER':'TOILET';
  if(!familyLogEnabledTypes(subject).includes(logType))return {ok:false};
  const family=await env.DB.prepare('SELECT timezone FROM families WHERE id=? LIMIT 1').bind(member.family_id).first<Row>();
  if(!family)return {ok:false};
  const current=familyNow(String(family.timezone||DEFAULT_FAMILY_TIMEZONE));
  const occurredAt=preset==='MINUS_60'?addWallClockMinutes(current,-60):current;
  const r=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,NULL)').bind(member.family_id,subjectId,logType,occurredAt,detailCode,member.id,current,current).run();
  const id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};
  const operation=`${logType}_${detailCode}`;
  await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{log_type:logType,detail_code:detailCode,subject_id:subjectId,occurred_at:occurredAt,source:'google_home_scene',operation});
  return {ok:true,id,operation,occurred_at:occurredAt};
}
const EXTERNAL_VALUELESS_PET_TYPES=new Set(['MEAL','BATH','MEDICINE','WATER']);
export async function recordExternalPetQuickLogDomain(env:Env,member:CurrentMember,subjectId:number,logType:string):Promise<{ok:boolean;id?:number;operation?:string}>{
  const type=String(logType).toUpperCase();if(!EXTERNAL_VALUELESS_PET_TYPES.has(type))return {ok:false};
  const subject=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json,overview_quick_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind='PET'").bind(subjectId,member.family_id).first<Row>();if(!subject||!familyLogEnabledTypes(subject).includes(type))return {ok:false};
  let quick:string[]=[];try{const parsed=JSON.parse(String(subject.overview_quick_types_json||'[]'));if(Array.isArray(parsed))quick=parsed.map(String).map(x=>x.toUpperCase());}catch{}if(!quick.includes(type))return {ok:false};
  const family=await env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(member.family_id).first<Row>();if(!family)return {ok:false};const n=familyNow(String(family.timezone||DEFAULT_FAMILY_TIMEZONE));
  const r=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL)').bind(member.family_id,subjectId,type,n,member.id,n,n).run(),id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{log_type:type,subject_id:subjectId,occurred_at:n,source:'google_home_scene',operation:`PET_${type}`});return {ok:true,id,operation:`PET_${type}`};
}
export async function startDedicatedSleepDomain(env:Env,member:CurrentMember,subjectId:number):Promise<{ok:boolean;id?:number;already?:boolean}>{
  const child=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();if(!child||!supportsDedicatedSleep(child.subject_kind)||!familyLogEnabledTypes(child).includes('SLEEP'))return {ok:false};
  const existing=await env.DB.prepare("SELECT id FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running' LIMIT 1").bind(member.family_id,subjectId).first<Row>();if(existing)return {ok:true,id:Number(existing.id),already:true};
  const now=nowJst(),startedMs=Date.now();const r=await env.DB.prepare("INSERT INTO family_log_timers(family_id,subject_id,log_type,started_at,started_at_ms,status,note,created_by,created_at,updated_at,timer_label) SELECT ?,?,'SLEEP',?,?,'running',NULL,?,?,?,'睡眠' WHERE NOT EXISTS(SELECT 1 FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running')").bind(member.family_id,subjectId,now,startedMs,member.id,now,now,member.family_id,subjectId).run();
  let id=Number(r.meta.last_row_id||0);if(!id){const raced=await env.DB.prepare("SELECT id FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running' LIMIT 1").bind(member.family_id,subjectId).first<Row>();return {ok:true,id:Number(raced?.id||0),already:true};}await logActivity(externalActionContext(env,member),'STARTED','family_log_timer',id,{log_type:'SLEEP',subject_id:subjectId});return {ok:true,id};
}
export async function stopDedicatedSleepDomain(env:Env,member:CurrentMember,subjectId:number,timerId?:number,wakeAt=nowJst()):Promise<{ok:boolean;log_id?:number;duration_minutes?:number;already?:boolean}>{
  const child=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();if(!child||!familyLogEnabledTypes(child).includes('SLEEP'))return {ok:false};
  const timer=await env.DB.prepare(`SELECT x.*,s.name subject_name FROM family_log_timers x JOIN family_log_subjects s ON s.id=x.subject_id AND s.family_id=x.family_id AND s.active=1 AND s.subject_kind IN ('BABY','CHILD') WHERE x.family_id=? AND x.subject_id=? AND x.log_type='SLEEP' AND x.status='running' ${timerId?'AND x.id=?':''} ORDER BY x.id DESC LIMIT 1`).bind(...(timerId?[member.family_id,subjectId,timerId]:[member.family_id,subjectId])).first<Row>();
  if(!timer){const subject=await env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();return {ok:Boolean(subject),already:Boolean(subject)};}
  const wakeMs=familyLogJstMs(wakeAt),startedMs=Number(timer.started_at_ms);if(!Number.isFinite(startedMs)||wakeMs<startedMs||wakeMs>Date.now()+60000)throw new BadRequest('起床時刻が不正です。');const duration=Math.round((wakeMs-startedMs)/60000);if(duration>SLEEP_TIMER_MAX_ADJUST_MINUTES)throw new BadRequest('睡眠時間は48時間以内で指定してください。');const now=nowJst();
  const stopped=await env.DB.prepare("UPDATE family_log_timers SET status='stopped',updated_at=? WHERE id=? AND family_id=? AND log_type='SLEEP' AND status='running'").bind(now,timer.id,member.family_id).run();if(!stopped.meta.changes)return {ok:true,already:true};
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,duration_minutes,created_by,created_at,updated_at) VALUES(?,?,'SLEEP',?,?,?,?,?)").bind(member.family_id,timer.subject_id,String(timer.started_at),duration,member.id,now,now).run();const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'SLEEP',subject_id:Number(timer.subject_id),subject_name:String(timer.subject_name||''),occurred_at:String(timer.started_at),duration_minutes:duration,source:'sleep_timer'});return {ok:true,log_id:logId,duration_minutes:duration};
}
function familyQuickChoreWeekdayMask(value:unknown):number{
  const mask=Number(value??127);
  if(!Number.isInteger(mask)||mask<0||mask>127)throw new BadRequest('表示曜日が不正です。');
  return mask;
}
function familyQuickChoreWeekdayBit(date:string):number{
  const day=new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return day===0?64:1<<(day-1);
}
function familyLogTruthy(value:unknown, fallback=false):boolean{
  if(value===undefined||value===null||value==='')return fallback;
  if(typeof value==='boolean')return value;
  return ['1','true','on','yes'].includes(String(value).toLowerCase());
}
type ValidatedTaskFamilyLogTemplate={enabled:boolean;values:unknown[]};
async function validateTaskFamilyLogTemplateInput(ctx:AppContext,b:Record<string,unknown>):Promise<ValidatedTaskFamilyLogTemplate>{
  const m=requireMember(ctx),enabled=familyLogTruthy(b.family_log_enabled,false);
  if(!enabled)return {enabled:false,values:[]};
  const logType=String(b.family_log_type||'').toUpperCase();if(!FAMILY_LOG_TYPES.includes(logType))throw new BadRequest('家族ログの記録種類が不正です。');
  let subjectId=Number(b.family_log_subject_id||0)||null;
  if(logType==='HOUSEWORK')subjectId=null;
  if(subjectId){const subject=await ctx.env.DB.prepare('SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(subjectId,m.family_id).first<Row>();if(!subject||!familyLogEnabledTypes(subject).includes(logType))throw new BadRequest('家族ログの対象または記録種類を利用できません。');}
  else if(logType!=='HOUSEWORK')throw new BadRequest('家族ログの記録対象を選択してください。');
  return {enabled:true,values:[subjectId,logType,String(b.family_log_detail_code||'').trim()||null,Number.isFinite(Number(b.family_log_amount))&&String(b.family_log_amount??'')!==''?Number(b.family_log_amount):null,String(b.family_log_unit||'').trim().slice(0,40)||null,Number.isInteger(Number(b.family_log_duration_minutes))&&String(b.family_log_duration_minutes??'')!==''?Math.max(0,Math.min(10080,Number(b.family_log_duration_minutes))):null,String(b.family_log_value_text||'').trim().slice(0,255)||null,String(b.family_log_note||'').trim().slice(0,2000)||null]};
}
async function saveTaskFamilyLogTemplate(ctx:AppContext,taskId:number,b:Record<string,unknown>,validated?:ValidatedTaskFamilyLogTemplate):Promise<void>{
  const m=requireMember(ctx),parsed=validated??await validateTaskFamilyLogTemplateInput(ctx,b),enabled=parsed.enabled,now=nowJst();
  const current=await ctx.env.DB.prepare('SELECT id FROM task_family_log_templates WHERE task_id=? AND family_id=? AND active=1 LIMIT 1').bind(taskId,m.family_id).first<Row>();
  if(!enabled){if(current)await ctx.env.DB.prepare('UPDATE task_family_log_templates SET active=0,updated_at=? WHERE id=? AND family_id=?').bind(now,Number(current.id),m.family_id).run();return;}
  const values=parsed.values;
  if(current)await ctx.env.DB.prepare('UPDATE task_family_log_templates SET subject_id=?,log_type=?,detail_code=?,amount=?,unit=?,duration_minutes=?,value_text=?,note=?,updated_at=? WHERE id=? AND family_id=?').bind(...values,now,Number(current.id),m.family_id).run();
  else await ctx.env.DB.prepare('INSERT INTO task_family_log_templates(family_id,task_id,subject_id,log_type,detail_code,amount,unit,duration_minutes,value_text,note,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,?)').bind(m.family_id,taskId,...values,m.id,now,now).run();
}

export async function recordOccurrenceFamilyLog(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);if(request.method!=='POST')throw new BadRequest('POSTを使用してください。');const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);const occurrenceId=Number(b.occurrence_id||0);if(!occurrenceId)throw new BadRequest('発生日が不正です。');
  const row=await ctx.env.DB.prepare(`SELECT o.id,o.occurrence_date,o.status,r.task_id,t.task_kind,ft.id template_id,ft.subject_id,ft.log_type,ft.detail_code,ft.amount,ft.unit,ft.duration_minutes,ft.value_text,ft.note
    FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=o.family_id JOIN task_family_log_templates ft ON ft.task_id=t.id AND ft.family_id=o.family_id AND ft.active=1
    WHERE o.id=? AND o.family_id=? AND o.status<>'excluded' LIMIT 1`).bind(occurrenceId,m.family_id).first<Row>();
  if(!row||String(row.task_kind||'').toUpperCase()==='EVENT')return json({ok:false,error:'家族ログ連携された定期タスク発生日が見つかりません。'},404);
  if(row.subject_id){const subject=await ctx.env.DB.prepare('SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(Number(row.subject_id),m.family_id).first<Row>();if(!subject||!familyLogEnabledTypes(subject).includes(String(row.log_type)))throw new BadRequest('設定された家族ログ対象は現在利用できません。');}
  const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members mm ON mm.id=ta.member_id AND mm.active=1 WHERE ta.task_id=?').bind(Number(row.task_id)).first<Row>();
  const actorAssigned=Number(assigned?.c||0)===0||Boolean(await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees WHERE task_id=? AND member_id=? LIMIT 1').bind(Number(row.task_id),m.id).first<Row>());if(!actorAssigned)return json({ok:false,error:'記録者がこの定期タスクの担当者ではありません。'},409);
  const existing=await ctx.env.DB.prepare('SELECT id FROM family_logs WHERE task_family_log_template_id=? AND linked_occurrence_id=? AND created_by=? AND deleted_at IS NULL LIMIT 1').bind(Number(row.template_id),occurrenceId,m.id).first<Row>();let logId=Number(existing?.id||0),created=false;
  if(!logId){const now=nowJst(),today=dateOnly(),occurredAt=String(row.occurrence_date)===today?now:`${row.occurrence_date} 12:00:00`;const ins=await ctx.env.DB.prepare('INSERT OR IGNORE INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(m.family_id,row.subject_id||null,row.log_type,occurredAt,row.detail_code||null,row.amount??null,row.unit||null,row.duration_minutes??null,row.value_text||null,row.note||null,occurrenceId,m.id,now,now,Number(row.template_id)).run();logId=Number(ins.meta.last_row_id||0);created=logId>0;if(!logId){const raced=await ctx.env.DB.prepare('SELECT id FROM family_logs WHERE task_family_log_template_id=? AND linked_occurrence_id=? AND created_by=? AND deleted_at IS NULL LIMIT 1').bind(Number(row.template_id),occurrenceId,m.id).first<Row>();logId=Number(raced?.id||0);}}
  if(!logId)throw new BadRequest('家族ログを保存できませんでした。');const completion=await completeLinkedTargetFromFamilyLog(ctx,null,occurrenceId,logId);if(!completion.ok){if(created)await ctx.env.DB.prepare('UPDATE family_logs SET deleted_at=?,updated_at=? WHERE id=? AND family_id=?').bind(nowJst(),nowJst(),logId,m.family_id).run();return json({ok:false,error:completion.message},409);}
  return json({ok:true,id:logId,already:!created,status:completion.status,message:completion.message});
}

async function completeLinkedTargetFromFamilyLog(ctx:AppContext,linkedTaskId:number|null,linkedOccurrenceId:number|null,familyLogId:number):Promise<{ok:boolean;message:string;target_type?:string;target_id?:number;status?:string}>{
  const m=requireMember(ctx),now=nowJst();
  if(linkedTaskId){
    const task=await ctx.env.DB.prepare('SELECT id,status,completion_mode,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(linkedTaskId,m.family_id).first<Row>();
    if(!task)return {ok:false,message:'関連タスクが見つからないため自動完了しませんでした。'};
    if(String(task.task_kind||'').toLowerCase()==='event')return {ok:false,message:'イベントは完了対象外です。'};
    const already=await ctx.env.DB.prepare('SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1').bind(linkedTaskId,m.id).first<Row>();
    if(already)return {ok:true,message:'関連タスクはすでにこの記録者が完了済みです。',target_type:'task',target_id:linkedTaskId,status:String(task.status||'pending')};
    let assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(linkedTaskId).first<Row>();
    let actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(linkedTaskId,m.id).first<Row>();
    if(Number(assigned?.c||0)===0){
      await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)').bind(linkedTaskId,m.id).run();
      assigned={c:1};actorAssigned={x:1};
    }
    if(!actorAssigned)return {ok:false,message:'記録者が関連タスクの担当者ではないため、自動完了は行いませんでした。',target_type:'task',target_id:linkedTaskId};
    await ctx.env.DB.prepare('INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(linkedTaskId,m.id,now).run();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(linkedTaskId).first<Row>();
    const shouldComplete=String(task.completion_mode||'ANY').toUpperCase()==='ALL'?Number(done?.c||0)>=Number(assigned?.c||0):Number(done?.c||0)>0;
    await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(shouldComplete?'completed':'pending',shouldComplete?m.id:null,shouldComplete?now:null,now,linkedTaskId,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(linkedTaskId,m.id,'COMPLETED',now).run();
    if(shouldComplete)await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,linkedTaskId,m.family_id).run();
    await logActivity(ctx,'COMPLETED','task',linkedTaskId,{status:shouldComplete?'completed':'pending',source:'family_log',family_log_id:familyLogId});
    return {ok:true,message:'記録者を関連タスクの完了者として記録しました。',target_type:'task',target_id:linkedTaskId,status:shouldComplete?'completed':'pending'};
  }
  if(linkedOccurrenceId){
    const occ=await ctx.env.DB.prepare('SELECT o.id,o.recurrence_rule_id,r.task_id,r.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? LIMIT 1').bind(linkedOccurrenceId,m.family_id).first<Row>();
    if(!occ)return {ok:false,message:'関連する定期タスク発生日が見つからないため自動完了しませんでした。'};
    const taskId=Number(occ.task_id||0);
    const already=await ctx.env.DB.prepare('SELECT 1 x FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=? LIMIT 1').bind(linkedOccurrenceId,m.id).first<Row>();
    if(already)return {ok:true,message:'関連する定期タスク発生日はすでにこの記録者が完了済みです。',target_type:'recurrence',target_id:linkedOccurrenceId};
    let assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(taskId).first<Row>();
    let actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(taskId,m.id).first<Row>();
    if(Number(assigned?.c||0)===0){
      await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)').bind(taskId,m.id).run();
      assigned={c:1};actorAssigned={x:1};
    }
    if(!actorAssigned)return {ok:false,message:'記録者が定期タスクの担当者ではないため、自動完了は行いませんでした。',target_type:'recurrence',target_id:linkedOccurrenceId};
    await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(linkedOccurrenceId,m.id,now).run();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=?').bind(taskId,linkedOccurrenceId).first<Row>();
    const isComplete=String(occ.completion_mode||'ANY').toUpperCase()==='ALL'?Number(done?.c||0)>=Number(assigned?.c||0):Number(done?.c||0)>0;
    await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(isComplete?'completed':'pending',isComplete?m.id:null,isComplete?now:null,now,linkedOccurrenceId,m.family_id).run();
    await logActivity(ctx,'COMPLETED','recurrence',linkedOccurrenceId,{occurrence_id:linkedOccurrenceId,rule_id:Number(occ.recurrence_rule_id||0),status:isComplete?'completed':'pending',source:'family_log',family_log_id:familyLogId});
    return {ok:true,message:'記録者を定期タスク発生日の完了者として記録しました。',target_type:'recurrence',target_id:linkedOccurrenceId,status:isComplete?'completed':'pending'};
  }
  return {ok:false,message:'関連タスクは指定されていません。'};
}

export function normalizeMilkAmountPresets(value:unknown):number[]{
  if(!Array.isArray(value)||value.length<1||value.length>6)throw new BadRequest('ミルク量の候補は1〜6件で指定してください。');
  const values=value.map(Number);
  if(values.some(v=>!Number.isInteger(v)||v<1||v>2000))throw new BadRequest('ミルク量は1〜2000mlの整数で指定してください。');
  return [...new Set(values)];
}

export async function familyLog(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx);
  const managementMode=new URL(request.url).pathname==='/app/settings_family_log.php';
  const familyLogRole=String(m.role||'').toUpperCase();
  const delegatedQuickChore=await ctx.env.DB.prepare("SELECT 1 ok FROM member_permissions WHERE family_id=? AND member_id=? AND permission_key='MANAGE_QUICK_CHORES'").bind(m.family_id,m.id).first<Row>();const familyLogIsAdmin=familyLogRole==='OWNER'||familyLogRole==='ADMIN';const canManageQuickChores=familyLogIsAdmin||Boolean(delegatedQuickChore);
  if(request.method==='POST'){
    const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);
    const action=String(b.action||'save');
    if(action==='settings_update'){
      if(!familyLogIsAdmin)return json({ok:false,error:'表示設定はOWNER / ADMINのみ変更できます。'},403);
      const showAdultLogs=familyLogTruthy(b.show_adult_logs,true)?1:0;const now=nowJst();
      const milkPresets=normalizeMilkAmountPresets(b.milk_amount_presets);
      await ctx.env.DB.batch([
        ctx.env.DB.prepare(`INSERT INTO family_log_settings(family_id,show_adult_logs,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET show_adult_logs=excluded.show_adult_logs,updated_at=excluded.updated_at`).bind(m.family_id,showAdultLogs,now,now),
        ctx.env.DB.prepare(`INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`).bind(m.family_id,'family_log_milk_amount_presets',JSON.stringify(milkPresets),now)
      ]);
      await logActivity(ctx,'UPDATED','family_log_settings',m.family_id,{show_adult_logs:showAdultLogs,milk_amount_presets:milkPresets});
      return json({ok:true,show_adult_logs:Boolean(showAdultLogs),milk_amount_presets:milkPresets});
    }
    const quickChoreManagement=['quick_chore_add','quick_chore_update','quick_chore_remove','quick_chore_restore','quick_chore_reorder'];
    if(quickChoreManagement.includes(action)&&!canManageQuickChores)return json({ok:false,error:'ちょこっと家事の項目編集権限が必要です。'},403);
    if(action==='quick_chore_add'){
      const name=String(b.name||'').trim();
      if(!name||name.length>80)throw new BadRequest('家事の名前を80文字以内で入力してください。');
      const icon=String(b.icon||'✨').trim().slice(0,8)||'✨',weekdayMask=familyQuickChoreWeekdayMask(b.weekday_mask);const now=nowJst();
      const order=await ctx.env.DB.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM family_quick_chores WHERE family_id=?').bind(m.family_id).first<Row>();
      const r=await ctx.env.DB.prepare('INSERT INTO family_quick_chores(family_id,name,icon,sort_order,active,created_by,created_at,updated_at,weekday_mask) VALUES(?,?,?,?,1,?,?,?,?)').bind(m.family_id,name,icon,Number(order?.n||1),m.id,now,now,weekdayMask).run();
      await logActivity(ctx,'CREATED','family_quick_chore',Number(r.meta.last_row_id),{name,icon,weekday_mask:weekdayMask});
      return json({ok:true,id:Number(r.meta.last_row_id)});
    }
    if(action==='quick_chore_update'){
      const id=Number(b.id||0),name=String(b.name||'').trim(),icon=String(b.icon||'✨').trim().slice(0,8)||'✨',weekdayMask=familyQuickChoreWeekdayMask(b.weekday_mask);
      if(!id)throw new BadRequest('家事項目が不正です。');
      if(!name||name.length>80)throw new BadRequest('家事の名前を80文字以内で入力してください。');
      const result=await ctx.env.DB.prepare('UPDATE family_quick_chores SET name=?,icon=?,weekday_mask=?,updated_at=? WHERE id=? AND family_id=?').bind(name,icon,weekdayMask,nowJst(),id,m.family_id).run();
      if(!result.meta.changes)return json({ok:false,error:'家事項目が見つかりません。'},404);
      await logActivity(ctx,'UPDATED','family_quick_chore',id,{name,icon,weekday_mask:weekdayMask});return json({ok:true,id});
    }
    if(action==='quick_chore_restore'){
      const id=Number(b.id||0);if(!id)throw new BadRequest('家事項目が不正です。');
      const result=await ctx.env.DB.prepare('UPDATE family_quick_chores SET active=1,sort_order=(SELECT COALESCE(MAX(sort_order),0)+1 FROM family_quick_chores WHERE family_id=? AND active=1),updated_at=? WHERE id=? AND family_id=? AND active=0').bind(m.family_id,nowJst(),id,m.family_id).run();
      if(!result.meta.changes)return json({ok:false,error:'非表示の家事項目が見つかりません。'},404);
      await logActivity(ctx,'RESTORED','family_quick_chore',id,{});return json({ok:true,id});
    }
    if(action==='quick_chore_reorder'){
      const ids=Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(id=>id>0):[];
      const rows=await ctx.env.DB.prepare('SELECT id FROM family_quick_chores WHERE family_id=? AND active=1 ORDER BY sort_order,id').bind(m.family_id).all<Row>();
      const current=rows.results.map(x=>Number(x.id));
      if(ids.length!==current.length||new Set(ids).size!==ids.length||ids.some(id=>!current.includes(id)))throw new BadRequest('並べ替え対象が最新ではありません。画面を再読み込みしてください。');
      const now=nowJst();await ctx.env.DB.batch(ids.map((id,index)=>ctx.env.DB.prepare('UPDATE family_quick_chores SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(index+1,now,id,m.family_id)));
      await logActivity(ctx,'UPDATED','family_quick_chore',null,{operation:'reorder',ids});return json({ok:true});
    }
    if(action==='quick_chore_remove'){
      const id=Number(b.id||0);if(!id)throw new BadRequest('家事項目が不正です。');const now=nowJst();
      const row=await ctx.env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE id=? AND family_id=? AND active=1').bind(id,m.family_id).first<Row>();
      if(!row)return json({ok:false,error:'家事項目が見つかりません。'},404);
      await ctx.env.DB.prepare('UPDATE family_quick_chores SET active=0,updated_at=? WHERE id=? AND family_id=?').bind(now,id,m.family_id).run();
      await logActivity(ctx,'DISABLED','family_quick_chore',id,{name:String(row.name||'')});return json({ok:true});
    }
    if(action==='quick_chore_record'){
      const result=await recordQuickChoreDomain(ctx.env,m,Number(b.id||0));return result.ok?json(result):json({ok:false,error:'家事項目が見つかりません。'},404);
    }
    if(action==='subject_create'||action==='subject_update'){
      const id=action==='subject_update'?Number(b.id||0):0;
      const name=String(b.name||'').trim();
      if(!name||name.length>80)throw new BadRequest('対象の名前を80文字以内で入力してください。');
      const kind=familyLogSubjectKind(b.subject_kind||'BABY');
      const birth=String(b.birth_date||'').trim()||null;
      if(birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth))throw new BadRequest('生年月日が不正です。');
      const enabledInput=Array.isArray(b.enabled_types)?(b.enabled_types as unknown[]):familyLogDefaultTypes(kind);
      const enabled=[...new Set(enabledInput.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))];
      if(!enabled.length)throw new BadRequest('表示する記録項目を1つ以上選択してください。');
      const enabledJson=JSON.stringify(enabled);
      const showOnOverview=familyLogTruthy(b.show_on_family_overview,false)?1:0;
      const overviewInput=Array.isArray(b.overview_quick_types)?(b.overview_quick_types as unknown[]):[];
      const overviewTypes=[...new Set(overviewInput.map(x=>String(x||'').toUpperCase()).filter(x=>enabled.includes(x)))];
      const overviewJson=showOnOverview?JSON.stringify(overviewTypes):null;
      const autoComplete=familyLogTruthy(b.auto_complete_linked_task,familyLogDefaultAutoComplete(kind)===1)?1:0;
      const now=nowJst();
      if(id){
        const current=await ctx.env.DB.prepare('SELECT id,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1').bind(id,m.family_id).first<Row>();
        if(!current)return json({ok:false,error:'記録対象が見つかりません。'},404);
        await ctx.env.DB.prepare('UPDATE family_log_subjects SET name=?,subject_kind=?,birth_date=?,enabled_types_json=?,auto_complete_linked_task=?,show_on_family_overview=?,overview_quick_types_json=?,updated_at=? WHERE id=? AND family_id=? AND active=1')
          .bind(name,kind,birth,enabledJson,autoComplete,showOnOverview,overviewJson,now,id,m.family_id).run();
        const linkedMemberId=Number(current.member_id||0);
        if(linkedMemberId){
          const linkedMemberType=['BABY','CHILD'].includes(kind)?'CHILD':'ADULT';
          await ctx.env.DB.prepare('UPDATE members SET member_type=?,updated_at=? WHERE id=? AND family_id=? AND deleted_at IS NULL').bind(linkedMemberType,now,linkedMemberId,m.family_id).run();
        }
        await logActivity(ctx,'UPDATED','family_log_subject',id,{name,subject_kind:kind,enabled_types:enabled,show_on_family_overview:showOnOverview,overview_quick_types:overviewTypes,auto_complete_linked_task:autoComplete,linked_member_id:linkedMemberId||null});
        return json({ok:true,id});
      }
      const memberId=Number(b.member_id||0)||null;
      if(memberId){
        const member=await ctx.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(memberId,m.family_id).first<Row>();
        if(!member)throw new BadRequest('連携するメンバーが見つかりません。');
        const existing=await ctx.env.DB.prepare('SELECT id FROM family_log_subjects WHERE family_id=? AND member_id=? LIMIT 1').bind(m.family_id,memberId).first<Row>();
        if(existing)throw new BadRequest('この家族メンバーはすでに家族ログ対象として表示されています。');
      }
      const r=await ctx.env.DB.prepare('INSERT INTO family_log_subjects(family_id,member_id,name,subject_kind,birth_date,icon,active,created_by,created_at,updated_at,enabled_types_json,auto_complete_linked_task,show_on_family_overview,overview_quick_types_json) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?,?)')
        .bind(m.family_id,memberId,name,kind,birth,null,m.id,now,now,enabledJson,autoComplete,showOnOverview,overviewJson).run();
      await logActivity(ctx,'CREATED','family_log_subject',Number(r.meta.last_row_id),{name,subject_kind:kind,enabled_types:enabled,auto_complete_linked_task:autoComplete});
      return json({ok:true,id:Number(r.meta.last_row_id)});
    }
    if(action==='subject_disable'){
      const id=Number(b.id||0);if(!id)throw new BadRequest('記録対象が不正です。');
      const current=await ctx.env.DB.prepare('SELECT id,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1').bind(id,m.family_id).first<Row>();
      if(!current)return json({ok:false,error:'記録対象が見つかりません。'},404);
      if(Number(current.member_id||0)>0)throw new BadRequest('家族メンバー連携の対象は非表示にできません。メンバー管理で停止してください。');
      const now=nowJst();
      await ctx.env.DB.prepare('UPDATE family_log_subjects SET active=0,updated_at=? WHERE id=? AND family_id=?').bind(now,id,m.family_id).run();
      await ctx.env.DB.prepare("UPDATE family_log_timers SET status='cancelled',updated_at=? WHERE subject_id=? AND family_id=? AND status='running'").bind(now,id,m.family_id).run();
      await logActivity(ctx,'DISABLED','family_log_subject',id,{});
      return json({ok:true});
    }
    if(action==='save'){
      const id=Number(b.id||0)||0;
      let subjectId=Number(b.subject_id||0)||null;
      const type=String(b.log_type||'').toUpperCase();if(!FAMILY_LOG_TYPES.includes(type))throw new BadRequest('記録種類が不正です。');
      // HOUSEWORK is a family-wide event. The actor is represented by created_by,
      // never by the log subject, including when a stale client submits a subject.
      if(type==='HOUSEWORK')subjectId=null;
      else if(!subjectId)throw new BadRequest('記録対象を選択してください。');
      let subjectRow:Row|undefined;
      if(subjectId){subjectRow=await ctx.env.DB.prepare('SELECT id,name,subject_kind,auto_complete_linked_task,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1').bind(subjectId,m.family_id).first<Row>()||undefined;if(!subjectRow)throw new BadRequest('記録対象が見つかりません。');if(!familyLogEnabledTypes(subjectRow).includes(type))throw new BadRequest('この対象では記録種類が有効ではありません。');}
      const occurredAt=familyLogDateTime(b.occurred_at);
      const detail=String(b.detail_code||'').trim().toUpperCase()||null;
      if(detail&&detail.length>32)throw new BadRequest('詳細区分が長すぎます。');
      const amountRaw=String(b.amount??'').trim();const amount=amountRaw===''?null:Number(amountRaw);
      if(amount!==null&&(!Number.isFinite(amount)||amount<-100000||amount>100000))throw new BadRequest('数値が不正です。');
      const durationRaw=String(b.duration_minutes??'').trim();const duration=durationRaw===''?null:Number(durationRaw);
      if(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>10080))throw new BadRequest('時間が不正です。');
      const unit=String(b.unit||'').trim().slice(0,16)||null;
      const valueText=String(b.value_text||'').trim();if(valueText.length>255)throw new BadRequest('内容は255文字以内にしてください。');
      const note=String(b.note||'').trim();if(note.length>2000)throw new BadRequest('メモは2000文字以内にしてください。');
      let linkedTaskId:number|null=null,linkedOccurrenceId:number|null=null;
      const linked=String(b.linked_target||'').trim();
      if(linked.startsWith('task:')){linkedTaskId=Number(linked.slice(5))||null;if(linkedTaskId){const t=await ctx.env.DB.prepare('SELECT id FROM tasks WHERE id=? AND family_id=?').bind(linkedTaskId,m.family_id).first<Row>();if(!t)throw new BadRequest('関連タスク・イベントが見つかりません。');}}
      else if(linked.startsWith('occ:')){linkedOccurrenceId=Number(linked.slice(4))||null;if(linkedOccurrenceId){const o=await ctx.env.DB.prepare('SELECT id FROM recurrence_occurrences WHERE id=? AND family_id=?').bind(linkedOccurrenceId,m.family_id).first<Row>();if(!o)throw new BadRequest('関連する定期タスク発生日が見つかりません。');}}
      const now=nowJst();
      const activityBase={log_type:type,occurred_at:occurredAt,subject_id:subjectId,subject_name:String(subjectRow?.name||''),detail_code:detail,amount,unit,duration_minutes:duration,value_text:valueText||null,linked_task_id:linkedTaskId,linked_occurrence_id:linkedOccurrenceId};
      if(id){
        const current=await ctx.env.DB.prepare('SELECT id,linked_task_id,linked_occurrence_id,quick_chore_id FROM family_logs WHERE id=? AND family_id=? AND deleted_at IS NULL').bind(id,m.family_id).first<Row>();if(!current)return json({ok:false,error:'記録が見つかりません。'},404);
        // Source identity survives edits only while the record remains HOUSEWORK.
        // Manual records have NULL here and are never inferred from value_text.
        const quickChoreId=type==='HOUSEWORK'?(Number(current.quick_chore_id||0)||null):null;
        await ctx.env.DB.prepare('UPDATE family_logs SET subject_id=?,log_type=?,occurred_at=?,detail_code=?,amount=?,unit=?,duration_minutes=?,value_text=?,note=?,linked_task_id=?,linked_occurrence_id=?,quick_chore_id=?,updated_at=? WHERE id=? AND family_id=? AND deleted_at IS NULL')
          .bind(subjectId,type,occurredAt,detail,amount,unit,duration,valueText||null,note||null,linkedTaskId,linkedOccurrenceId,quickChoreId,now,id,m.family_id).run();
        const completion=subjectRow&&Number(subjectRow.auto_complete_linked_task||0)===1&&(linkedTaskId||linkedOccurrenceId)?await completeLinkedTargetFromFamilyLog(ctx,linkedTaskId,linkedOccurrenceId,id):null;
        await logActivity(ctx,'UPDATED','family_log',id,{...activityBase,linked_completion:completion});
        return json({ok:true,id,linked_completion:completion});
      }
      const r=await ctx.env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)')
        .bind(m.family_id,subjectId,type,occurredAt,detail,amount,unit,duration,valueText||null,note||null,linkedTaskId,linkedOccurrenceId,m.id,now,now).run();
      const logId=Number(r.meta.last_row_id);
      const completion=subjectRow&&Number(subjectRow.auto_complete_linked_task||0)===1&&(linkedTaskId||linkedOccurrenceId)?await completeLinkedTargetFromFamilyLog(ctx,linkedTaskId,linkedOccurrenceId,logId):null;
      await logActivity(ctx,'CREATED','family_log',logId,{...activityBase,linked_completion:completion});
      return json({ok:true,id:logId,linked_completion:completion});
    }
    if(action==='delete'){
      const id=Number(b.id||0);if(!id)throw new BadRequest('記録が不正です。');const now=nowJst();
      const current=await ctx.env.DB.prepare('SELECT l.id,l.log_type,l.occurred_at,l.detail_code,l.amount,l.unit,l.duration_minutes,l.value_text,l.subject_id,s.name subject_name FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id WHERE l.id=? AND l.family_id=? AND l.deleted_at IS NULL').bind(id,m.family_id).first<Row>();
      if(!current)return json({ok:false,error:'記録が見つかりません。'},404);
      const result=await ctx.env.DB.prepare('UPDATE family_logs SET deleted_at=?,updated_at=? WHERE id=? AND family_id=? AND deleted_at IS NULL').bind(now,now,id,m.family_id).run();
      if(!result.meta.changes)return json({ok:false,error:'記録が見つかりません。'},404);
      await logActivity(ctx,'DELETED','family_log',id,{log_type:String(current.log_type||''),occurred_at:String(current.occurred_at||''),subject_id:Number(current.subject_id||0)||null,subject_name:String(current.subject_name||''),detail_code:current.detail_code||null,amount:current.amount??null,unit:current.unit||null,duration_minutes:current.duration_minutes??null,value_text:current.value_text||null});return json({ok:true});
    }
    if(action==='timer_start'){
      const type=String(b.log_type||'TIMER').toUpperCase();if(type!=='TIMER')throw new BadRequest('新しいタイマーは汎用タイマーとして開始してください。');
      const timerLabel=String(b.timer_label||'').trim();if(!timerLabel||timerLabel.length>80)throw new BadRequest('タイマー名を1〜80文字で入力してください。');
      const subjectId=Number(b.subject_id||0)||null;
      if(subjectId){const subject=await ctx.env.DB.prepare('SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1').bind(subjectId,m.family_id).first<Row>();if(!subject)throw new BadRequest('記録対象が見つかりません。');}
      const existing=await ctx.env.DB.prepare("SELECT id FROM family_log_timers WHERE family_id=? AND status='running' AND log_type=? AND COALESCE(subject_id,0)=?").bind(m.family_id,type,subjectId||0).first<Row>();
      if(existing)throw new BadRequest('同じ種類のタイマーが既に動いています。');
      const now=nowJst();const r=await ctx.env.DB.prepare("INSERT INTO family_log_timers(family_id,subject_id,log_type,started_at,started_at_ms,status,note,created_by,created_at,updated_at,timer_label) VALUES(?,?,?,?,?,'running',NULL,?,?,?,?,?)")
        .bind(m.family_id,subjectId,type,now,Date.now(),m.id,now,now,timerLabel).run();
      await logActivity(ctx,'STARTED','family_log_timer',Number(r.meta.last_row_id),{log_type:type,timer_label:timerLabel});return json({ok:true,id:Number(r.meta.last_row_id)});
    }
    if(action==='sleep_start'){
      const subjectId=Number(b.subject_id||0);if(!subjectId)throw new BadRequest('睡眠対象を選択してください。');const result=await startDedicatedSleepDomain(ctx.env,m,subjectId);if(!result.ok)throw new BadRequest('赤ちゃん・子どもの対象だけ睡眠タイマーを開始できます。');return json(result);
    }
    if(action==='sleep_adjust'){
      const timerId=Number(b.timer_id||0),startedAt=familyLogDateTime(b.started_at),startedMs=familyLogJstMs(startedAt),nowMs=Date.now();
      if(!Number.isFinite(startedMs)||startedMs>nowMs)throw new BadRequest('開始時刻に未来は指定できません。');
      if(nowMs-startedMs>SLEEP_TIMER_MAX_ADJUST_MINUTES*60000)throw new BadRequest('開始時刻は48時間以内で指定してください。');
      const result=await ctx.env.DB.prepare("UPDATE family_log_timers SET started_at=?,started_at_ms=?,updated_at=? WHERE id=? AND family_id=? AND log_type='SLEEP' AND status='running' AND EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=family_log_timers.subject_id AND s.family_id=family_log_timers.family_id AND s.subject_kind IN ('BABY','CHILD') AND s.active=1)").bind(startedAt,startedMs,nowJst(),timerId,m.family_id).run();
      if(!result.meta.changes)return json({ok:false,error:'実行中の子ども睡眠タイマーが見つかりません。'},404);
      return json({ok:true});
    }
    if(action==='sleep_stop'){
      const timerId=Number(b.timer_id||0),wakeAt=familyLogDateTime(b.wake_at||nowJst()),wakeMs=familyLogJstMs(wakeAt);
      const timer=await ctx.env.DB.prepare("SELECT x.*,s.name subject_name,s.subject_kind FROM family_log_timers x JOIN family_log_subjects s ON s.id=x.subject_id AND s.family_id=x.family_id AND s.active=1 AND s.subject_kind IN ('BABY','CHILD') WHERE x.id=? AND x.family_id=? AND x.log_type='SLEEP' AND x.status='running' LIMIT 1").bind(timerId,m.family_id).first<Row>();
      if(!timer)return json({ok:false,error:'実行中の子ども睡眠タイマーが見つかりません。'},404);
      void wakeMs;return json(await stopDedicatedSleepDomain(ctx.env,m,Number(timer.subject_id),timerId,wakeAt));
    }
    if(action==='timer_stop'){
      const timerId=Number(b.timer_id||0);if(!timerId)throw new BadRequest('タイマーが不正です。');
      const timer=await ctx.env.DB.prepare("SELECT * FROM family_log_timers WHERE id=? AND family_id=? AND status='running' LIMIT 1").bind(timerId,m.family_id).first<Row>();if(!timer)return json({ok:false,error:'実行中のタイマーが見つかりません。'},404);
      const duration=Math.max(0,Math.min(10080,Math.round((Date.now()-Number(timer.started_at_ms||Date.now()))/60000)));const now=nowJst();
      const r=await ctx.env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,NULL,NULL,NULL,?,?,?,NULL,NULL,?,?,?,NULL)')
        .bind(m.family_id,timer.subject_id||null,String(timer.log_type||'SLEEP'),String(timer.started_at||now),duration,String(timer.timer_label||'')||null,timer.note||null,m.id,now,now).run();
      await ctx.env.DB.prepare("UPDATE family_log_timers SET status='stopped',updated_at=? WHERE id=? AND family_id=? AND status='running'").bind(now,timerId,m.family_id).run();
      const logId=Number(r.meta.last_row_id);
      const subject=timer.subject_id?await ctx.env.DB.prepare('SELECT name FROM family_log_subjects WHERE id=? AND family_id=?').bind(Number(timer.subject_id),m.family_id).first<Row>():null;
      await logActivity(ctx,'CREATED','family_log',logId,{log_type:String(timer.log_type||'SLEEP'),occurred_at:String(timer.started_at||now),subject_id:Number(timer.subject_id||0)||null,subject_name:String(subject?.name||''),duration_minutes:duration,source:'timer'});
      await logActivity(ctx,'STOPPED','family_log_timer',timerId,{family_log_id:logId,duration_minutes:duration});return json({ok:true,log_id:logId});
    }
    if(action==='timer_cancel'){
      const timerId=Number(b.timer_id||0);if(!timerId)throw new BadRequest('タイマーが不正です。');const now=nowJst();
      const result=await ctx.env.DB.prepare("UPDATE family_log_timers SET status='cancelled',updated_at=? WHERE id=? AND family_id=? AND status='running'").bind(now,timerId,m.family_id).run();
      if(!result.meta.changes)return json({ok:false,error:'実行中のタイマーが見つかりません。'},404);
      await logActivity(ctx,'CANCELLED','family_log_timer',timerId,{});return json({ok:true});
    }
    throw new BadRequest('操作が不正です。');
  }

  const url=new URL(request.url);
  const selectedDate=/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')||'')?String(url.searchParams.get('date')):dateOnly();
  const setting=await ctx.env.DB.prepare('SELECT show_adult_logs FROM family_log_settings WHERE family_id=?').bind(m.family_id).first<Row>();
  const showAdultLogs=setting===null||setting===undefined||Number(setting.show_adult_logs)===1;
  const subjectParam=String(url.searchParams.get('subject')||'');
  const adultAggregate=showAdultLogs&&subjectParam==='adult';
  const selectedSubject=adultAggregate||subjectParam==='adult'?0:Math.max(0,Number(subjectParam||0)||0);
  const recorderFilter=Math.max(0,Number(url.searchParams.get('recorder')||0)||0);
  const dashboardRequested=url.searchParams.get('dashboard')==='1';
  const members=await ctx.env.DB.prepare('SELECT id,name,member_type,icon,active FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  await ensureFamilyLogMemberSubjects(ctx,m.family_id,m.id);
  const subjects=await ctx.env.DB.prepare(`SELECT s.*,fm.name member_name,fm.active member_active
    FROM family_log_subjects s
    LEFT JOIN members fm ON fm.id=s.member_id AND fm.family_id=s.family_id
    WHERE s.family_id=? AND s.active=1
      AND (s.member_id IS NULL OR COALESCE(fm.active,0)=1)
    ORDER BY CASE WHEN s.member_id IS NOT NULL THEN 0 ELSE 1 END,COALESCE(fm.id,s.id),s.id`).bind(m.family_id).all<Row>();
  if(selectedSubject&&!subjects.results.some(s=>Number(s.id)===selectedSubject))throw new BadRequest('記録対象が見つかりません。');
  const milkPresetSetting=await ctx.env.DB.prepare("SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key='family_log_milk_amount_presets'").bind(m.family_id).first<Row>();
  let milkAmountPresets=[160,240];
  if(milkPresetSetting?.setting_value){try{milkAmountPresets=normalizeMilkAmountPresets(JSON.parse(String(milkPresetSetting.setting_value)));}catch{milkAmountPresets=[160,240];}}
  const latestMilkRows=await ctx.env.DB.prepare("SELECT subject_id,amount FROM (SELECT subject_id,amount,ROW_NUMBER() OVER(PARTITION BY subject_id ORDER BY occurred_at DESC,id DESC) latest_rank FROM family_logs WHERE family_id=? AND log_type='MILK' AND deleted_at IS NULL AND subject_id IS NOT NULL AND amount IS NOT NULL AND amount>0 AND amount<=2000) WHERE latest_rank=1").bind(m.family_id).all<Row>();
  const lastMilkAmounts:Record<string,number>=Object.create(null);
  for(const row of latestMilkRows.results){const key=String(Number(row.subject_id));if(!(key in lastMilkAmounts))lastMilkAmounts[key]=Number(row.amount);}

  const adultSubjects=subjects.results.filter(s=>familyLogSubjectKind(s.subject_kind)==='ADULT');
  const selectedSubjectRow=selectedSubject?subjects.results.find(s=>Number(s.id)===selectedSubject):undefined;
  const currentAdultSubject=adultSubjects.find(s=>Number(s.member_id||0)===m.id);
  if(recorderFilter&&!members.results.some(member=>Number(member.id)===recorderFilter))throw new BadRequest('記録者が見つかりません。');
  // All-view intentionally does not union every subject's enabled types. Promotions are explicit.
  const enabledTypes=selectedSubjectRow?familyLogEnabledTypes(selectedSubjectRow):[];
  const quickTypes=selectedSubjectRow?enabledTypes.filter(type=>FAMILY_LOG_TYPES.includes(type)):FAMILY_LOG_TYPES;

  // Wave91 dashboard: aggregate in D1 and return only compact daily/type buckets, never raw history.
  const dashboardRange=String(url.searchParams.get('range')||'7');
  const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);
  const dashboardEnd=validDate(String(url.searchParams.get('to')||''))?String(url.searchParams.get('to')):dateOnly();
  const subtractDays=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);};
  let dashboardStart=dashboardRange==='today'?dashboardEnd:subtractDays(dashboardEnd,dashboardRange==='30'?29:6);
  if(dashboardRange==='custom'&&validDate(String(url.searchParams.get('from')||'')))dashboardStart=String(url.searchParams.get('from'));
  if(dashboardStart>dashboardEnd)throw new BadRequest('集計期間が不正です。');
  const dashboardDays=Math.floor((Date.parse(`${dashboardEnd}T00:00:00Z`)-Date.parse(`${dashboardStart}T00:00:00Z`))/86400000)+1;
  if(dashboardDays>1096)throw new BadRequest('集計期間は3年以内にしてください。');
  const scopeSql:string[]=['l.family_id=?','l.deleted_at IS NULL','date(l.occurred_at)>=date(?)','date(l.occurred_at)<=date(?)'];
  const scopeParams:any[]=[m.family_id,dashboardStart,dashboardEnd];
  if(selectedSubject){scopeSql.push('l.subject_id=?');scopeParams.push(selectedSubject);}
  if(adultAggregate){scopeSql.push(`l.subject_id IN (${adultSubjects.map(()=>'?').join(',')||'NULL'})`);scopeParams.push(...adultSubjects.map(s=>Number(s.id)));}
  if(!showAdultLogs&&!selectedSubject&&!adultAggregate)scopeSql.push("NOT EXISTS (SELECT 1 FROM family_log_subjects hidden_adult WHERE hidden_adult.id=l.subject_id AND hidden_adult.family_id=l.family_id AND hidden_adult.subject_kind='ADULT')");
  if((adultAggregate||(!selectedSubject&&!adultAggregate))&&recorderFilter){scopeSql.push('l.created_by=?');scopeParams.push(recorderFilter);}
  const dashboardRows=dashboardRequested?await ctx.env.DB.prepare(`SELECT date(l.occurred_at) day,l.log_type,l.detail_code,COUNT(*) count,
      SUM(CASE WHEN l.amount IS NOT NULL THEN l.amount ELSE 0 END) amount_sum,
      MIN(l.amount) amount_min,MAX(l.amount) amount_max,
      SUM(CASE WHEN l.duration_minutes IS NOT NULL AND l.duration_minutes>=0 THEN l.duration_minutes ELSE 0 END) duration_sum,
      SUM(CASE WHEN l.duration_minutes IS NULL THEN 1 ELSE 0 END) duration_unknown
    FROM family_logs l WHERE ${scopeSql.join(' AND ')}
    GROUP BY date(l.occurred_at),l.log_type,l.detail_code ORDER BY day`).bind(...scopeParams).all<Row>():{results:[] as Row[]};
  const latestMetrics=dashboardRequested?await ctx.env.DB.prepare(`SELECT log_type,amount,occurred_at FROM (SELECT l.log_type,l.amount,l.occurred_at,ROW_NUMBER() OVER (PARTITION BY l.log_type ORDER BY l.occurred_at DESC,l.id DESC) rn FROM family_logs l WHERE ${scopeSql.join(' AND ')} AND l.log_type IN ('TEMPERATURE','WEIGHT','HEIGHT') AND l.amount IS NOT NULL) WHERE rn=1`).bind(...scopeParams).all<Row>():{results:[] as Row[]};
  const vaccineHistory=dashboardRequested?await ctx.env.DB.prepare(`SELECT l.occurred_at,l.value_text,l.note FROM family_logs l
    WHERE ${scopeSql.join(' AND ')} AND l.log_type='VACCINE' ORDER BY l.occurred_at DESC,l.id DESC LIMIT 50`).bind(...scopeParams).all<Row>():{results:[] as Row[]};
  const metricLatest=(type:string)=>latestMetrics.results.find(row=>String(row.log_type)===type);
  const typeRows=(type:string)=>dashboardRows.results.filter(row=>String(row.log_type)===type);
  const countFor=(type:string)=>typeRows(type).reduce((n,row)=>n+Number(row.count||0),0);
  const sumFor=(type:string,key:'amount_sum'|'duration_sum')=>typeRows(type).reduce((n,row)=>n+Number(row[key]||0),0);
  const fmtDuration=(minutes:number)=>minutes>=60?`${Math.floor(minutes/60)}時間${minutes%60?`${Math.round(minutes%60)}分`:''}`:`${Math.round(minutes)}分`;
  const cards:{icon:string;title:string;lines:string[]}[]=[];
  const milkCount=countFor('MILK'),milkAmount=sumFor('MILK','amount_sum');if(milkCount)cards.push({icon:'🍼',title:'ミルク',lines:[`合計 ${milkAmount}ml`,`${milkCount}回`,`1日平均 ${Math.round(milkAmount/dashboardDays)}ml`]});
  const sleepCount=countFor('SLEEP'),sleepMinutesDash=sumFor('SLEEP','duration_sum'),sleepUnknown=typeRows('SLEEP').reduce((n,r)=>n+Number(r.duration_unknown||0),0);if(sleepCount)cards.push({icon:'😴',title:'睡眠',lines:[`合計 ${fmtDuration(sleepMinutesDash)}`,`1日平均 ${fmtDuration(Math.round(sleepMinutesDash/dashboardDays))}`,`${sleepCount}回${sleepUnknown?`（時間不明 ${sleepUnknown}件）`:''}`]});
  const diaperRows=typeRows('DIAPER'),wetDash=diaperRows.filter(r=>['WET','BOTH'].includes(String(r.detail_code))).reduce((n,r)=>n+Number(r.count||0),0),dirtyDash=diaperRows.filter(r=>['DIRTY','BOTH'].includes(String(r.detail_code))).reduce((n,r)=>n+Number(r.count||0),0);if(diaperRows.length)cards.push({icon:'🧷',title:'おむつ',lines:[`おしっこ ${wetDash}回`,`うんち ${dirtyDash}回`]});
  const mealDash=countFor('MEAL');if(mealDash)cards.push({icon:'🍚',title:'食事',lines:[`${mealDash}回`]});
  const tempRows=typeRows('TEMPERATURE').filter(r=>r.amount_min!==null),latestTempDash=metricLatest('TEMPERATURE');if(tempRows.length&&latestTempDash)cards.push({icon:'🌡️',title:'体温',lines:[`最新 ${latestTempDash.amount}℃`,`最小 ${Math.min(...tempRows.map(r=>Number(r.amount_min)))}℃`,`最大 ${Math.max(...tempRows.map(r=>Number(r.amount_max)))}℃`]});
  const weightRows=typeRows('WEIGHT').filter(r=>r.amount_min!==null),latestWeightDash=metricLatest('WEIGHT');if(weightRows.length&&latestWeightDash){const first=weightRows[0];cards.push({icon:'⚖️',title:'体重',lines:[`最新 ${latestWeightDash.amount}kg`,`期間内変化 ${(Number(latestWeightDash.amount)-Number(first?.amount_min||latestWeightDash.amount)).toFixed(1)}kg`]});}
  const latestHeightDash=metricLatest('HEIGHT');if(latestHeightDash)cards.push({icon:'📏',title:'身長',lines:[`最新 ${latestHeightDash.amount}cm`,`記録日 ${String(latestHeightDash.occurred_at).slice(0,10)}`]});
  const vaccineCount=countFor('VACCINE');if(vaccineCount)cards.push({icon:'💉',title:'予防接種',lines:[`${vaccineCount}回`]});
  const dailySeries=(type:string,key:'amount_sum'|'duration_sum')=>{const map=new Map<string,number>();for(const row of typeRows(type))map.set(String(row.day),(map.get(String(row.day))||0)+Number(row[key]||0));return [...map].map(([day,value])=>({day,value}));};
  const barChart=(title:string,series:{day:string;value:number}[],unit:string)=>{if(!series.some(x=>x.value>0))return '';const max=Math.max(...series.map(x=>x.value),1);return `<section class="family-log-chart"><h3>${esc(title)}</h3><div class="family-log-bars" role="img" aria-label="${esc(title)}">${series.map(x=>`<div title="${esc(x.day)} ${Math.round(x.value)}${unit}"><span style="height:${Math.max(3,Math.round(x.value/max*100))}%"></span><small>${esc(x.day.slice(5))}</small></div>`).join('')}</div></section>`;};
  const lineChart=(title:string,type:string,unit:string)=>{const points=typeRows(type).filter(r=>r.amount_max!==null).map(r=>({amount:Number(r.amount_max),occurred_at:String(r.day)}));if(points.length<2)return '';const values=points.map(r=>Number(r.amount)),min=Math.min(...values),max=Math.max(...values),spread=max-min||1;const coords=points.map((r,i)=>`${i/(points.length-1)*100},${90-(Number(r.amount)-min)/spread*75}`).join(' ');return `<section class="family-log-chart"><h3>${esc(title)}</h3><svg viewBox="0 0 100 100" role="img" aria-label="${esc(title)}"><polyline points="${coords}"/><text x="2" y="12">${max}${unit}</text><text x="2" y="98">${min}${unit}</text></svg></section>`;};
  const dashboardCards=cards.map(card=>`<div class="family-log-dashboard-card"><strong>${card.icon} ${esc(card.title)}</strong>${card.lines.map(line=>`<span>${esc(line)}</span>`).join('')}</div>`).join('');
  const dashboardCharts=barChart('ミルク（日別合計）',dailySeries('MILK','amount_sum'),'ml')+barChart('睡眠（日別時間）',dailySeries('SLEEP','duration_sum'),'分')+lineChart('体温','TEMPERATURE','℃')+lineChart('体重','WEIGHT','kg')+lineChart('身長','HEIGHT','cm');
  const vaccineHtml=vaccineHistory.results.length?`<section class="family-log-vaccines"><h3>💉 予防接種履歴</h3>${vaccineHistory.results.map(row=>`<div><time>${esc(String(row.occurred_at).slice(0,16))}</time><strong>${esc(String(row.value_text||'ワクチン'))}</strong>${row.note?`<span>${esc(row.note)}</span>`:''}</div>`).join('')}</section>`:'';
  const rangeQuery=`&range=${encodeURIComponent(dashboardRange)}&from=${encodeURIComponent(dashboardStart)}&to=${encodeURIComponent(dashboardEnd)}`;
  const dashboardQuery=`dashboard=1&date=${encodeURIComponent(selectedDate)}&subject=${encodeURIComponent(adultAggregate?'adult':String(selectedSubject||''))}&recorder=${recorderFilter}${rangeQuery}`;
  const dashboardMeta=dashboardRange==='today'?'今日':dashboardRange==='30'?'過去30日':dashboardRange==='custom'?`${dashboardStart}〜${dashboardEnd}`:'過去7日';
  const recorderMeta=recorderFilter?` ・ 記録者: ${esc(String(members.results.find(x=>Number(x.id)===recorderFilter)?.name||''))}`:'';
  const dashboardHtml=`<details class="card family-log-dashboard" data-dashboard-loaded="${dashboardRequested?'1':'0'}"><summary><span>📊 まとめ</span><small>${esc(dashboardMeta)}${recorderMeta}</small></summary>${dashboardRequested?`<form method="get" class="family-log-range"><input type="hidden" name="dashboard" value="1"><input type="hidden" name="subject" value="${adultAggregate?'adult':selectedSubject||''}"><input type="hidden" name="recorder" value="${recorderFilter}"><button name="range" value="today">今日</button><button name="range" value="7">7日</button><button name="range" value="30">30日</button><button name="range" value="custom">期間指定</button><input type="date" name="from" value="${dashboardStart}"><input type="date" name="to" value="${dashboardEnd}"></form><p class="small">${dashboardStart} 〜 ${dashboardEnd}（JST）${recorderMeta}</p>${cards.length?`<div class="family-log-dashboard-grid">${dashboardCards}</div>${dashboardCharts}${vaccineHtml}`:'<p class="empty">この期間の記録はありません。</p>'}`:`<a class="family-log-dashboard-load" href="/app/family_log.php?${dashboardQuery}">集計を表示</a>`}</details>`;

  const timelineType=String(url.searchParams.get('type')||'').toUpperCase();
  const timelinePage=Math.max(1,Number(url.searchParams.get('page')||1)||1);
  const where=['l.family_id=?','l.deleted_at IS NULL','date(l.occurred_at)=date(?)'];const params:any[]=[m.family_id,selectedDate];
  if(timelineType&&FAMILY_LOG_TYPES.includes(timelineType)){where.push('l.log_type=?');params.push(timelineType);}
  if(selectedSubject){where.push('l.subject_id=?');params.push(selectedSubject);}
  if(adultAggregate){where.push(`l.subject_id IN (${adultSubjects.map(()=>'?').join(',')||'NULL'})`);params.push(...adultSubjects.map(s=>Number(s.id)));}
  if(!showAdultLogs&&!selectedSubject&&!adultAggregate)where.push("NOT EXISTS (SELECT 1 FROM family_log_subjects hidden_adult WHERE hidden_adult.id=l.subject_id AND hidden_adult.family_id=l.family_id AND hidden_adult.subject_kind='ADULT')");
  if((adultAggregate||(!selectedSubject&&!adultAggregate))&&recorderFilter){where.push('l.created_by=?');params.push(recorderFilter);}
  const logs=await ctx.env.DB.prepare(`SELECT l.*,ib.source import_source,s.name subject_name,cm.name creator_name,t.title linked_task_title,rr.name linked_recurrence_title,o.occurrence_date linked_occurrence_date
    FROM family_logs l
    LEFT JOIN family_log_import_batches ib ON ib.id=l.import_batch_id AND ib.family_id=l.family_id
    LEFT JOIN family_log_subjects s ON s.id=l.subject_id
    LEFT JOIN members cm ON cm.id=l.created_by
    LEFT JOIN tasks t ON t.id=l.linked_task_id AND t.family_id=l.family_id
    LEFT JOIN recurrence_occurrences o ON o.id=l.linked_occurrence_id AND o.family_id=l.family_id
    LEFT JOIN recurrence_rules rr ON rr.id=o.recurrence_rule_id AND rr.family_id=o.family_id
    WHERE ${where.join(' AND ')}
    ORDER BY l.occurred_at DESC,l.id DESC LIMIT 51 OFFSET ?`).bind(...params,(timelinePage-1)*50).all<Row>();
  const timerWhere=selectedSubject?"x.family_id=? AND x.status='running' AND x.subject_id=?":adultAggregate?`x.family_id=? AND x.status='running' AND x.subject_id IN (${adultSubjects.map(()=>'?').join(',')||'NULL'})`:showAdultLogs?"x.family_id=? AND x.status='running'":"x.family_id=? AND x.status='running' AND NOT EXISTS (SELECT 1 FROM family_log_subjects hidden_adult WHERE hidden_adult.id=x.subject_id AND hidden_adult.family_id=x.family_id AND hidden_adult.subject_kind='ADULT')";
  const timerParams=selectedSubject?[m.family_id,selectedSubject]:adultAggregate?[m.family_id,...adultSubjects.map(s=>Number(s.id))]:[m.family_id];
  const timers=await ctx.env.DB.prepare(`SELECT x.*,s.name subject_name FROM family_log_timers x LEFT JOIN family_log_subjects s ON s.id=x.subject_id WHERE ${timerWhere} ORDER BY x.started_at_ms`).bind(...timerParams).all<Row>();
  const physical=await ctx.env.DB.prepare(`SELECT id,title,task_kind FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND status IN ('pending','completed') AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) AND ((start_at IS NOT NULL AND date(start_at)<=date(?) AND (end_at IS NULL OR date(end_at)>=date(?))) OR (start_at IS NULL AND due_at IS NOT NULL AND date(due_at)=date(?))) ORDER BY sort_order,id`).bind(m.family_id,selectedDate,selectedDate,selectedDate).all<Row>();
  const recurring=await recurringForDate(ctx,selectedDate);
  const quickChores=await ctx.env.DB.prepare('SELECT id,name,icon,sort_order,active,weekday_mask FROM family_quick_chores WHERE family_id=? ORDER BY active DESC,sort_order,id').bind(m.family_id).all<Row>();
  const choreAggregateRows=await ctx.env.DB.prepare(`WITH periods(period,start_date) AS (
      SELECT '7d',date('now','+9 hours','-6 days') UNION ALL
      SELECT 'month',date('now','+9 hours','start of month')
    )
    SELECT p.period,l.quick_chore_id,q.name chore_name,q.icon chore_icon,q.active chore_active,
      l.created_by,cm.name recorder_name,COUNT(*) count
    FROM periods p
    JOIN family_logs l ON l.family_id=? AND l.log_type='HOUSEWORK' AND l.deleted_at IS NULL
      AND date(l.occurred_at)>=p.start_date AND date(l.occurred_at)<date('now','+9 hours','+1 day')
    LEFT JOIN family_quick_chores q ON q.id=l.quick_chore_id AND q.family_id=l.family_id
    LEFT JOIN members cm ON cm.id=l.created_by AND cm.family_id=l.family_id
    GROUP BY p.period,l.quick_chore_id,q.name,q.icon,q.active,l.created_by,cm.name
    ORDER BY p.period,count DESC,l.quick_chore_id,l.created_by`).bind(m.family_id).all<Row>();

  const choreAggregate=(period:string)=>{
    const rows=choreAggregateRows.results.filter(r=>String(r.period)===period);
    const items=new Map<string,{id:number|null,name:string,icon:string,active:boolean|null,count:number}>();
    const recorders=new Map<string,{id:number|null,name:string,count:number}>();
    let total=0;
    for(const row of rows){
      const count=Number(row.count||0);total+=count;
      const choreId=Number(row.quick_chore_id||0)||null,choreKey=choreId?String(choreId):'unlinked';
      const item=items.get(choreKey)||{id:choreId,name:choreId?String(row.chore_name||'削除済みの家事項目'):'過去の未紐付け家事',icon:choreId?String(row.chore_icon||'🧹'):'🗂️',active:row.chore_active===null||row.chore_active===undefined?null:Number(row.chore_active)===1,count:0};
      item.count+=count;items.set(choreKey,item);
      const recorderId=Number(row.created_by||0)||null,recorderKey=recorderId?String(recorderId):'unknown';
      const recorder=recorders.get(recorderKey)||{id:recorderId,name:String(row.recorder_name||'記録者不明'),count:0};
      recorder.count+=count;recorders.set(recorderKey,recorder);
    }
    return {total,items:[...items.values()].sort((a,b)=>b.count-a.count),recorders:[...recorders.values()].sort((a,b)=>b.count-a.count)};
  };
  const choreAggregates={week:choreAggregate('7d'),month:choreAggregate('month')};

  const timelineHasMore=logs.results.length>50;logs.results=logs.results.slice(0,50);
  const logMap=Object.fromEntries(logs.results.map(r=>[String(r.id),{
    id:Number(r.id),subject_id:Number(r.subject_id||0),log_type:String(r.log_type||''),occurred_at:String(r.occurred_at||''),
    detail_code:String(r.detail_code||''),amount:r.amount===null?null:Number(r.amount),unit:String(r.unit||''),
    duration_minutes:r.duration_minutes===null?null:Number(r.duration_minutes),value_text:String(r.value_text||''),note:String(r.note||''),
    linked_task_id:Number(r.linked_task_id||0),linked_occurrence_id:Number(r.linked_occurrence_id||0),imported:Boolean(r.import_batch_id),import_source:String(r.import_source||'')
  }]));
  const subjectMap=Object.fromEntries(subjects.results.map(s=>[String(s.id),{
    id:Number(s.id),member_id:Number(s.member_id||0),member_name:String(s.member_name||''),name:String(s.name||''),
    subject_kind:familyLogSubjectKind(s.subject_kind),birth_date:String(s.birth_date||''),icon:familyLogSubjectIcon(s),
    enabled_types:familyLogEnabledTypes(s),show_on_family_overview:Number(s.show_on_family_overview||0)===1,
    overview_quick_types:familyLogOverviewQuickTypes(s),auto_complete_linked_task:Number(s.auto_complete_linked_task||0)===1
  }]));

  const milkTotal=logs.results.filter(r=>String(r.log_type)==='MILK').reduce((sum,r)=>sum+Number(r.amount||0),0);
  const wetCount=logs.results.filter(r=>['DIAPER','TOILET'].includes(String(r.log_type))&&['WET','BOTH'].includes(String(r.detail_code||''))).length;
  const dirtyCount=logs.results.filter(r=>['DIAPER','TOILET'].includes(String(r.log_type))&&['DIRTY','BOTH'].includes(String(r.detail_code||''))).length;
  const diaperCount=logs.results.filter(r=>String(r.log_type)==='DIAPER').length;
  const toiletCount=logs.results.filter(r=>String(r.log_type)==='TOILET').length;
  const sleepMinutes=logs.results.filter(r=>String(r.log_type)==='SLEEP').reduce((sum,r)=>sum+Number(r.duration_minutes||0),0);
  const exerciseMinutes=logs.results.filter(r=>String(r.log_type)==='EXERCISE').reduce((sum,r)=>sum+Number(r.duration_minutes||0),0);
  const walkMinutes=logs.results.filter(r=>String(r.log_type)==='WALK').reduce((sum,r)=>sum+Number(r.duration_minutes||0),0);
  const waterTotal=logs.results.filter(r=>String(r.log_type)==='WATER').reduce((sum,r)=>sum+Number(r.amount||0),0);
  const mealCount=logs.results.filter(r=>String(r.log_type)==='MEAL').length;
  const bathCount=logs.results.filter(r=>String(r.log_type)==='BATH').length;
  const medicineCount=logs.results.filter(r=>String(r.log_type)==='MEDICINE').length;
  const memoCount=logs.results.filter(r=>String(r.log_type)==='MEMO').length;
  const latestTemp=logs.results.find(r=>String(r.log_type)==='TEMPERATURE'&&r.amount!==null&&r.amount!==undefined);
  const latestWeight=logs.results.find(r=>String(r.log_type)==='WEIGHT'&&r.amount!==null&&r.amount!==undefined);
  const latestHeight=logs.results.find(r=>String(r.log_type)==='HEIGHT'&&r.amount!==null&&r.amount!==undefined);
  const latestBp=logs.results.find(r=>String(r.log_type)==='BLOOD_PRESSURE'&&String(r.value_text||'').trim());
  const latestCondition=logs.results.find(r=>String(r.log_type)==='CONDITION');
  const hasType=(type:string)=>quickTypes.includes(type);
  const summaryItems:{value:string;label:string}[]=[{value:String(logs.results.length),label:'記録'}];
  const pushSummary=(type:string,value:string,label:string)=>{if(hasType(type))summaryItems.push({value,label});};
  const subjectKind=familyLogSubjectKind(selectedSubjectRow?.subject_kind);
  if(!selectedSubjectRow){
    summaryItems.push({value:String(subjects.results.length),label:'対象'});
    if(milkTotal)summaryItems.push({value:`${milkTotal}ml`,label:'ミルク'});
    if(diaperCount||toiletCount)summaryItems.push({value:String(diaperCount+toiletCount),label:'排泄'});
    if(sleepMinutes)summaryItems.push({value:`${sleepMinutes}分`,label:'睡眠'});
    if(latestTemp)summaryItems.push({value:`${latestTemp.amount}℃`,label:'最新体温'});
  }else if(subjectKind==='BABY'){
    pushSummary('MILK',milkTotal?`${milkTotal}ml`:'—','ミルク');
    pushSummary('DIAPER',wetCount?String(wetCount):'—','おしっこ');
    pushSummary('DIAPER',dirtyCount?String(dirtyCount):'—','うんち');
    pushSummary('SLEEP',sleepMinutes?`${sleepMinutes}分`:'—','睡眠');
    pushSummary('TEMPERATURE',latestTemp?`${latestTemp.amount}℃`:'—','最新体温');
  }else if(subjectKind==='CHILD'){
    pushSummary('TOILET',toiletCount?String(toiletCount):'—','トイレ');
    pushSummary('SLEEP',sleepMinutes?`${sleepMinutes}分`:'—','睡眠');
    pushSummary('TEMPERATURE',latestTemp?`${latestTemp.amount}℃`:'—','最新体温');
    pushSummary('WEIGHT',latestWeight?`${latestWeight.amount}kg`:'—','体重');
    pushSummary('HEIGHT',latestHeight?`${latestHeight.amount}cm`:'—','身長');
  }else if(subjectKind==='ADULT'){
    pushSummary('CONDITION',latestCondition?(FAMILY_LOG_DETAILS[String(latestCondition.detail_code||'')]||String(latestCondition.value_text||'記録あり')):'—','体調');
    pushSummary('SLEEP',sleepMinutes?`${sleepMinutes}分`:'—','睡眠');
    pushSummary('EXERCISE',exerciseMinutes?`${exerciseMinutes}分`:'—','運動');
    pushSummary('WEIGHT',latestWeight?`${latestWeight.amount}kg`:'—','体重');
    pushSummary('BLOOD_PRESSURE',latestBp?String(latestBp.value_text):'—','血圧');
  }else if(subjectKind==='PET'){
    pushSummary('MEAL',mealCount?String(mealCount):'—','食事');
    pushSummary('WATER',waterTotal?`${waterTotal}ml`:'—','水分');
    pushSummary('TOILET',toiletCount?String(toiletCount):'—','トイレ');
    pushSummary('WALK',walkMinutes?`${walkMinutes}分`:'—','散歩');
    pushSummary('WEIGHT',latestWeight?`${latestWeight.amount}kg`:'—','体重');
  }else{
    pushSummary('TEMPERATURE',latestTemp?`${latestTemp.amount}℃`:'—','最新体温');
    pushSummary('MEDICINE',medicineCount?String(medicineCount):'—','薬');
    pushSummary('SLEEP',sleepMinutes?`${sleepMinutes}分`:'—','睡眠');
    pushSummary('MEAL',mealCount?String(mealCount):'—','食事');
    pushSummary('MEMO',memoCount?String(memoCount):'—','メモ');
  }
  const summaryHtml=summaryItems.slice(0,6).map(x=>`<div><strong>${esc(x.value)}</strong><span>${esc(x.label)}</span></div>`).join('');

  const dt=new Date(`${selectedDate}T12:00:00Z`);dt.setUTCDate(dt.getUTCDate()-1);const prev=dt.toISOString().slice(0,10);dt.setUTCDate(dt.getUTCDate()+2);const next=dt.toISOString().slice(0,10);
  const subjectQuery=adultAggregate?'&subject=adult':selectedSubject?`&subject=${selectedSubject}`:'';
  const subjectChips=`<div class="family-log-subjects"><a class="${selectedSubject===0&&!adultAggregate?'active':''}" href="/app/family_log.php?date=${selectedDate}${rangeQuery}">すべて</a>${showAdultLogs?(adultSubjects.length>1?`<a class="${adultAggregate?'active':''}" href="/app/family_log.php?date=${selectedDate}&subject=adult">👤 大人</a>`:adultSubjects.map(s=>`<a class="${selectedSubject===Number(s.id)?'active':''}" href="/app/family_log.php?date=${selectedDate}&subject=${s.id}">${esc(familyLogSubjectIcon(s))} ${esc(s.name)}</a>`).join('')):''}${subjects.results.filter(s=>familyLogSubjectKind(s.subject_kind)!=='ADULT').map(s=>`<a class="${selectedSubject===Number(s.id)?'active':''}" href="/app/family_log.php?date=${selectedDate}&subject=${s.id}">${esc(familyLogSubjectIcon(s))} ${esc(s.name)}</a>`).join('')}</div>`;
  const sleepTimerFor=(subjectId:number)=>timers.results.find(t=>Number(t.subject_id)===subjectId&&String(t.log_type)==='SLEEP');
  const sleepAction=(subject:Row)=>{const running=sleepTimerFor(Number(subject.id));return running?`<button type="button" class="family-log-quick family-log-sleep-stop" data-id="${running.id}" data-started-ms="${Number(running.started_at_ms)}">☀️ <strong>起きた</strong></button>`:`<button type="button" class="family-log-quick family-log-sleep-start" data-subject-id="${subject.id}">😴 <strong>寝た</strong></button>`;};
  const subjectQuickTypes=selectedSubjectRow?quickTypes.filter(type=>!(supportsDedicatedSleep(subjectKind)&&type==='SLEEP')):[];
  const quickButtons=subjectQuickTypes.map(type=>`<button type="button" class="family-log-quick" data-log-type="${type}"><span>${FAMILY_LOG_TYPE_META[type].icon}</span><strong>${FAMILY_LOG_TYPE_META[type].label}</strong></button>`).join('')+(selectedSubjectRow&&supportsDedicatedSleep(subjectKind)&&enabledTypes.includes('SLEEP')?sleepAction(selectedSubjectRow):'');
  const overviewQuickHtml=!selectedSubject&&!adultAggregate?subjects.results.filter(s=>familyLogSubjectKind(s.subject_kind)!=='ADULT'&&familyLogOverviewQuickTypes(s).length).map(subject=>`<section class="family-log-overview-group"><h2>${esc(familyLogSubjectIcon(subject))} ${esc(subject.name)}</h2><div class="family-log-quick-grid">${familyLogOverviewQuickTypes(subject).map(type=>type==='SLEEP'&&supportsDedicatedSleep(subject.subject_kind)?sleepAction(subject):`<button type="button" class="family-log-quick" data-log-type="${type}" data-subject-id="${subject.id}"><span>${FAMILY_LOG_TYPE_META[type].icon}</span><strong>${FAMILY_LOG_TYPE_META[type].label}</strong></button>`).join('')}</div></section>`).join(''):'';
  const linkOptions=[...physical.results.map(t=>({value:`task:${t.id}`,label:`${String(t.task_kind||'').toLowerCase()==='event'?'📌':'📝'} ${String(t.title||'')}`})),...recurring.map(r=>({value:`occ:${r.recurrence_occurrence_id}`,label:`🔁 ${String(r.title||r.name||'定期タスク')}`}))];
  const rowHtml=logs.results.map(r=>{
    const type=String(r.log_type||'MEMO'),meta=FAMILY_LOG_TYPE_META[type]||FAMILY_LOG_TYPE_META.MEMO;const bits:string[]=[];
    if(r.detail_code)bits.push(FAMILY_LOG_DETAILS[String(r.detail_code)]||String(r.detail_code));
    if(r.amount!==null&&r.amount!==undefined)bits.push(`${r.amount}${String(r.unit||'')}`);
    if(r.duration_minutes!==null&&r.duration_minutes!==undefined)bits.push(`${r.duration_minutes}分`);
    if(r.value_text)bits.push(String(r.value_text));
    const link=r.linked_task_title?`📝 ${r.linked_task_title}`:r.linked_recurrence_title?`🔁 ${r.linked_recurrence_title}`:'';
    return `<div class="family-log-row" data-id="${r.id}"><div class="family-log-time">${esc(String(r.occurred_at||'').slice(11,16))}</div><div class="family-log-icon">${meta.icon}</div><div class="family-log-main"><div><strong>${esc(meta.label)}</strong>${r.subject_name?` <span class="family-log-subject-badge">${esc(r.subject_name)}</span>`:''}</div>${bits.length?`<div class="family-log-value">${bits.map(esc).join(' ・ ')}</div>`:''}${r.note?`<div class="meta">${esc(r.note)}</div>`:''}${r.creator_name?`<div class="meta family-log-recorder">記録：${esc(r.creator_name)}</div>`:''}${link?`<div class="meta family-log-link">${esc(link)}</div>`:''}</div><button type="button" class="btn gray small family-log-edit" data-id="${r.id}">編集</button></div>`;
  }).join('');
  const timerHtml=timers.results.filter(t=>String(t.log_type)!=='SLEEP').map(t=>{
    const type=String(t.log_type||'SLEEP'),meta=FAMILY_LOG_TYPE_META[type]||FAMILY_LOG_TYPE_META.SLEEP;
    const timerName=String(t.timer_label||'').trim()||meta.label;
    const elapsed=Math.max(0,Math.floor((Date.now()-Number(t.started_at_ms||Date.now()))/60000));
    return `<div class="family-log-timer-row"><div><strong>${meta.icon} ${esc(timerName)}</strong>${t.subject_name?` <span class="family-log-subject-badge">${esc(t.subject_name)}</span>`:''}<span class="family-log-timer-elapsed" data-started-ms="${Number(t.started_at_ms||0)}">${elapsed}:00</span></div><div class="actions"><button type="button" class="btn small family-log-timer-stop" data-id="${t.id}">停止</button><button type="button" class="btn gray small family-log-timer-cancel" data-id="${t.id}">取消</button></div></div>`;
  }).join('');
  const sleepRunningHtml=timers.results.filter(t=>String(t.log_type)==='SLEEP').map(t=>{const elapsed=Math.max(0,Math.floor((Date.now()-Number(t.started_at_ms))/60000));return `<section class="family-log-sleep-running"><div><strong>😴 ${esc(t.subject_name||'子ども')} 睡眠中 <span class="family-log-timer-elapsed" data-started-ms="${Number(t.started_at_ms)}">${elapsed}:00</span></strong>${elapsed>=SLEEP_TIMER_WARNING_MINUTES?'<p class="family-log-sleep-warning">⚠️ 睡眠タイマーが長時間継続しています</p>':''}</div><div class="actions"><button type="button" class="btn small family-log-sleep-stop" data-id="${t.id}" data-started-ms="${Number(t.started_at_ms)}">☀️ 起きた</button><button type="button" class="btn gray small family-log-sleep-adjust" data-id="${t.id}" data-started-at="${esc(String(t.started_at||'').replace(' ','T').slice(0,16))}">開始時刻を修正</button></div></section>`;}).join('');
  const timerStartHtml=`<form class="family-log-custom-timer" id="familyLogTimerForm"><input name="timer_label" maxlength="80" required placeholder="タイマー名（例：腹ばい、遊び、勉強、散歩）">${(!selectedSubject&&!adultAggregate)|| (adultAggregate&&!currentAdultSubject)?`<select name="subject_id" required><option value="">対象を選択</option>${subjects.results.filter(subject=>showAdultLogs||familyLogSubjectKind(subject.subject_kind)!=='ADULT').map(subject=>`<option value="${subject.id}">${esc(subject.name)}</option>`).join('')}</select>`:`<input type="hidden" name="subject_id" value="${adultAggregate?Number(currentAdultSubject?.id||0):selectedSubject||0}">`}<button type="submit" class="btn secondary">開始</button></form><div class="small" id="familyLogTimerStatus"></div>`;
  const selectedWeekdayBit=familyQuickChoreWeekdayBit(selectedDate);
  const activeQuickChores=quickChores.results.filter(x=>Number(x.active)===1&&(Number(x.weekday_mask??127)&selectedWeekdayBit)!==0);
  const quickChoreHtml=activeQuickChores.map(x=>`<div class="family-quick-chore"><button type="button" class="family-quick-chore-record" data-id="${x.id}"><span>${esc(x.icon||'✨')}</span><strong>${esc(x.name)}</strong></button></div>`).join('');
  const choreAggregatePanel=(title:string,data:ReturnType<typeof choreAggregate>)=>`<section class="family-chore-period"><div class="family-chore-period-head"><strong>${esc(title)}</strong><span><b>${data.total}</b> 回</span></div>${data.total?`<div class="family-chore-breakdown"><div><h3>家事項目</h3>${data.items.map(x=>`<div class="family-chore-stat"><span>${esc(x.icon)} ${esc(x.name)}${x.active===false?' <small>非表示</small>':''}</span><b>${x.count}</b></div>`).join('')}</div><div><h3>記録者</h3>${data.recorders.map(x=>`<div class="family-chore-stat"><span>${esc(x.name)}</span><b>${x.count}</b></div>`).join('')}</div></div>`:'<p class="small">この期間の記録はありません。</p>'}</section>`;
  const choreAggregateHtml=`<details class="card family-chore-history"><summary><span><strong>📊 家事の記録</strong><small>家族全体の回数・項目・記録者</small></span><span class="family-chore-summary-count">7日 ${choreAggregates.week.total}回</span></summary><div class="family-chore-history-body">${choreAggregatePanel('過去7日（今日を含む）',choreAggregates.week)}${choreAggregatePanel('今月',choreAggregates.month)}<p class="small family-chore-note">名前変更後も同じ家事項目として集計します。未紐付けの過去記録は推測せず別表示します。</p></div></details>`;
  const selectedSubjectLabel=adultAggregate?'大人':selectedSubject?String(selectedSubjectRow?.name||'対象'):'家族全員';
  const selectedSubjectMode=adultAggregate?'一括':selectedSubjectRow?FAMILY_LOG_SUBJECT_META[subjectKind]?.label||'対象':'全対象';
  const nowLocal=selectedDate===dateOnly()?nowJst().slice(0,16).replace(' ','T'):`${selectedDate}T12:00`;
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||'',managementMode,selectedDate,selectedSubject:adultAggregate?Number(currentAdultSubject?.id||0):selectedSubject,adultAggregate,showAdultLogs,nowLocal,isAdmin:canManageQuickChores,milkAmountPresets,lastMilkAmounts,eligibleSubjectCount:subjects.results.length,sleepWarningMinutes:SLEEP_TIMER_WARNING_MINUTES,sleepConfirmMinutes:SLEEP_TIMER_CONFIRM_MINUTES,sleepMaxAdjustMinutes:SLEEP_TIMER_MAX_ADJUST_MINUTES,logs:logMap,subjects:subjectMap,quickChores:quickChores.results.map(x=>({id:Number(x.id),name:String(x.name),icon:String(x.icon||'✨'),active:Number(x.active)===1,weekday_mask:Number(x.weekday_mask??127)}))}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const subjectTypeChoices=FAMILY_LOG_SUBJECT_TYPES.map(type=>`<label class="checkrow family-log-type-choice"><input type="checkbox" name="enabled_types" value="${type}"><span>${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</span></label>`).join('');

  const managementSubjects=subjects.results.map(subject=>`<div class="family-log-management-row"><span>${esc(familyLogSubjectIcon(subject))} <strong>${esc(subject.name)}</strong><small>${esc(FAMILY_LOG_SUBJECT_META[familyLogSubjectKind(subject.subject_kind)]?.label||'対象')}</small></span><button type="button" class="btn gray small family-log-subject-edit" data-id="${subject.id}">編集</button></div>`).join('');
  const weekdayLabels=['月','火','水','木','金','土','日'];
  const weekdaySummary=(mask:number)=>weekdayLabels.filter((_,i)=>(mask&(1<<i))!==0).join(' ')||'表示なし';
  const managementChores=quickChores.results.map(chore=>`<div class="family-log-management-row family-chore-management-row"><span><strong>${esc(chore.icon||'✨')} ${esc(chore.name)}</strong><small>${esc(weekdaySummary(Number(chore.weekday_mask??127)))}${Number(chore.active)?'':' · 非表示'}</small></span><button type="button" class="btn gray small family-quick-chore-edit" data-id="${chore.id}">編集</button></div>`).join('');
  const managementBody=`<div class="page-head family-log-head family-log-management-head"><h1>🐣 家族ログ管理</h1><a class="family-log-back-icon" href="/app/settings.php" aria-label="管理に戻る" title="管理に戻る">←</a></div><div class="card"><div class="section-head"><h2>記録対象・表示項目</h2>${familyLogIsAdmin?'<button type="button" class="btn small" id="familyLogSubjectOpen">＋ 対象追加</button>':''}</div>${managementSubjects}</div><div class="card family-log-settings-row"><button type="button" id="familyLogSettingsOpen" ${familyLogIsAdmin?'':'disabled'}><strong>大人ログ</strong><span>${showAdultLogs?'ON':'OFF'} ›</span></button></div><div class="card"><div class="section-head"><h2>🧹 ちょこっと家事</h2>${canManageQuickChores?'<button type="button" class="btn small" id="familyQuickChoreAdd">＋ 項目</button>':''}</div><div class="family-log-management-actions">${managementChores}</div></div><div class="card settings-links"><div class="section-link"><div><h2>📥 データインポート</h2><p class="small">データの取込とインポート履歴を管理します。</p></div><a class="btn gray" href="/app/family_log_import.php">開く</a></div></div>`;
  const dailyBody=`<div class="page-head family-log-head"><h1>🐣 家族ログ</h1><a class="family-log-gear" href="/app/settings_family_log.php" aria-label="家族ログ設定" title="家族ログ設定">⚙️</a></div>
  ${subjectChips}
  <div class="family-log-date-head"><a href="/app/family_log.php?date=${prev}${subjectQuery}" aria-label="前の日">‹</a><label><span>${esc(selectedDate.slice(5).replace('-','/'))}</span><input type="date" value="${selectedDate}" onchange="location.href='/app/family_log.php?date='+this.value+'${subjectQuery}'"></label><a href="/app/family_log.php?date=${next}${subjectQuery}" aria-label="次の日">›</a></div>
  ${selectedSubject||adultAggregate||!quickChoreHtml?'':`<section class="family-quick-chore-card"><h2>🧹 ちょこっと家事</h2><div class="family-quick-chore-grid">${quickChoreHtml}</div></section>`}
  ${overviewQuickHtml?`<div class="family-log-overview-quick">${overviewQuickHtml}</div>`:''}
  ${quickButtons?`<div class="family-log-quick-card"><div class="family-log-quick-grid">${quickButtons}</div></div>`:''}
  ${sleepRunningHtml}
  <details class="card family-log-timer-card"${timerHtml?' open':''}><summary>▶ ⏱ その他のタイマー</summary>${timerHtml}${timerStartHtml}</details>
  ${selectedSubject||adultAggregate?'':choreAggregateHtml}
  ${dashboardHtml}
  <div class="card family-log-timeline"><div class="section-head"><h2>履歴</h2><form method="get" class="family-log-history-filters"><input type="hidden" name="date" value="${selectedDate}"><input type="hidden" name="subject" value="${adultAggregate?'adult':selectedSubject||''}"><select name="type" aria-label="種類" onchange="this.form.submit()"><option value="">すべて</option>${quickTypes.map(type=>`<option value="${type}" ${timelineType===type?'selected':''}>${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</option>`).join('')}<option value="MEMO" ${timelineType==='MEMO'?'selected':''}>📝 その他</option></select>${(adultAggregate||!selectedSubject)?`<select name="recorder" aria-label="記録者" onchange="this.form.submit()"><option value="0">記録者：すべて</option>${members.results.map(member=>`<option value="${member.id}" ${recorderFilter===Number(member.id)?'selected':''}>${esc(member.name)}</option>`).join('')}</select>`:`<input type="hidden" name="recorder" value="0">`}</form></div>${rowHtml||'<p class="empty">記録はありません。</p>'}<nav class="family-log-pagination">${timelinePage>1?`<a class="btn gray" href="?date=${selectedDate}${subjectQuery}&recorder=${recorderFilter}&type=${timelineType}&page=${timelinePage-1}${rangeQuery}">前へ</a>`:''}${timelineHasMore?`<a class="btn gray" href="?date=${selectedDate}${subjectQuery}&recorder=${recorderFilter}&type=${timelineType}&page=${timelinePage+1}${rangeQuery}">さらに読み込む</a>`:''}</nav></div>`;
  const sharedControls=`<div class="family-log-backdrop" id="familyLogModal" aria-hidden="true"><div class="family-log-sheet family-log-record-sheet"><div class="section-head"><h2 id="familyLogModalTitle">記録を追加</h2><button type="button" class="btn gray small" id="familyLogClose">×</button></div><form id="familyLogForm" class="family-log-record-form"><input type="hidden" name="id"><div class="family-log-primary-fields"><div id="familyLogTypeControl"><label>種類</label><select name="log_type">${FAMILY_LOG_TYPES.map(type=>`<option value="${type}">${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</option>`).join('')}</select></div><div id="familyLogSubjectControl"><label>対象</label><select name="subject_id"><option value="0">家族共通</option>${subjects.results.filter(s=>showAdultLogs||familyLogSubjectKind(s.subject_kind)!=='ADULT').map(s=>`<option value="${s.id}">${esc(familyLogSubjectIcon(s))} ${esc(s.name)}</option>`).join('')}</select></div><div id="familyLogSubjectChip" class="family-log-subject-chip" hidden></div><label class="family-log-datetime-row"><span>日時</span><input type="datetime-local" name="occurred_at" required></label></div><div id="familyLogDetailWrap"><label>詳細</label><div id="familyLogDetailChoices" class="family-log-detail-choices"></div><select name="detail_code"><option value="">指定なし</option></select></div><div id="familyLogAmountWrap"><label id="familyLogAmountLabel">値</label><div id="familyLogMilkPresets" class="family-log-preset-values" hidden></div><div class="family-log-value-input"><input type="number" name="amount"><span id="familyLogAmountUnit"></span><input type="hidden" name="unit"></div></div><div id="familyLogDurationWrap"><label id="familyLogDurationLabel">時間</label><div class="family-log-value-input"><input type="number" name="duration_minutes" min="0" max="10080" step="1"><span>分</span></div></div><div id="familyLogTextWrap"><label id="familyLogTextLabel">内容</label><input name="value_text" maxlength="255"></div><details id="familyLogAdvanced" class="family-log-advanced"><summary>▶ 詳細</summary><label>関連タスク・イベント（任意）</label><select name="linked_target"><option value="">なし</option>${linkOptions.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('')}</select><label>メモ</label><textarea name="note" maxlength="2000"></textarea><div id="familyLogProvenance" class="meta family-log-provenance" hidden></div></details><div id="familyLogStatus" class="small" aria-live="polite"></div><div class="family-log-form-actions"><button type="submit">保存する</button><button type="button" class="btn danger" id="familyLogDelete">削除</button></div></form></div></div>

  <div class="family-log-backdrop" id="familyLogSubjectModal" aria-hidden="true"><div class="family-log-sheet small-sheet"><div class="section-head"><h2 id="familyLogSubjectTitle">記録対象を追加</h2><button type="button" class="btn gray small" id="familyLogSubjectClose">×</button></div><form id="familyLogSubjectForm"><input type="hidden" name="id"><label>名前</label><input name="name" maxlength="80" required placeholder="例：はる、赤ちゃん"><label>画面タイプ</label><select name="subject_kind"><option value="BABY">👶 赤ちゃん</option><option value="CHILD">🧒 子ども</option><option value="ADULT">👤 大人</option><option value="PET">🐾 ペット</option><option value="OTHER">⭐ その他</option></select><label>生年月日（任意）</label><input type="date" name="birth_date"><div class="family-log-type-setting-head"><label>表示する記録項目</label><div class="family-log-presets"><button type="button" class="btn gray small family-log-pet-preset" data-preset="CAT">🐱 猫向け</button><button type="button" class="btn gray small family-log-pet-preset" data-preset="DOG">🐶 犬向け</button><button type="button" class="btn gray small" id="familyLogPresetApply">おすすめ</button></div></div><div class="choice-list family-log-type-choice-grid">${subjectTypeChoices}</div><p class="small" id="familyLogSubjectGuide">対象タイプごとのおすすめ項目を使えます。</p><label class="checkrow family-log-overview-toggle"><input type="checkbox" name="show_on_family_overview" id="familyLogShowOverview"><span>「すべて」にこの対象の記録を表示する</span></label><div id="familyLogOverviewTypes" hidden><label>「すべて」に表示する項目</label><div class="choice-list family-log-type-choice-grid">${FAMILY_LOG_SUBJECT_TYPES.map(type=>`<label class="checkrow family-log-type-choice"><input type="checkbox" name="overview_quick_types" value="${type}"><span>${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</span></label>`).join('')}</div></div><label class="checkrow family-log-auto-complete"><input type="checkbox" name="auto_complete_linked_task" id="familyLogAutoComplete"><span>この対象の記録時、関連タスクを記録した人の完了として反映する</span></label><p class="small">赤ちゃん・子ども・ペットではおすすめONです。担当者が未設定なら記録者を担当者として追加します。別の担当者が設定済みの場合は勝手に変更しません。</p><div id="familyLogSubjectLinked" class="notice" style="display:none"></div><button type="button" class="btn secondary" id="familyLogSubjectPromote" style="display:none">LINE本登録へ招待</button><div id="familyLogSubjectPromoteOut" class="notice" style="display:none"></div><div id="familyLogSubjectStatus" class="small" aria-live="polite"></div><div class="family-log-form-actions"><button type="submit">保存する</button><button type="button" class="btn danger" id="familyLogSubjectDisable">対象を非表示</button></div></form><p class="small">家族メンバーは自動的に対象として表示されます。赤ちゃん・子どもは後から「LINE本登録へ招待」で同じ記録対象を家族メンバーへ引き継げます。</p></div></div>
  ${canManageQuickChores?`<div class="family-log-backdrop" id="familyQuickChoreModal" aria-hidden="true"><div class="family-log-sheet small-sheet"><div class="section-head"><h2 id="familyQuickChoreTitle">家事項目を追加</h2><button type="button" class="btn gray small" id="familyQuickChoreClose">×</button></div><form id="familyQuickChoreForm"><input type="hidden" name="id"><label>アイコン</label><input name="icon" maxlength="8" value="✨" placeholder="✨"><label>名前</label><input name="name" maxlength="80" required placeholder="例：玄関を掃く"><label>表示曜日</label><div class="family-chore-weekdays">${weekdayLabels.map((label,i)=>`<label><input type="checkbox" name="weekday" value="${1<<i}" checked><span>${label}</span></label>`).join('')}</div><div id="familyQuickChoreStatus" class="small" aria-live="polite"></div><div class="family-log-form-actions"><button type="submit">保存する</button><button type="button" class="btn danger" id="familyQuickChoreDisable">非表示</button></div></form><div class="family-quick-chore-manage"><div class="section-head"><h3>表示順</h3><span class="small">矢印で移動</span></div><div id="familyQuickChoreOrder"></div><div id="familyQuickChoreHidden"></div></div></div></div>`:''}
  ${familyLogIsAdmin?`<div class="family-log-backdrop" id="familyLogSettingsModal" aria-hidden="true"><div class="family-log-sheet small-sheet"><div class="section-head"><h2>⚙️ 表示設定</h2><button type="button" class="btn gray small" id="familyLogSettingsClose">×</button></div><form id="familyLogSettingsForm"><label class="checkrow"><input type="checkbox" name="show_adult_logs" ${showAdultLogs?'checked':''}><span>大人の記録を表示する</span></label><label>ミルク量の候補（1〜6件、ml）</label><input name="milk_amount_presets" inputmode="numeric" value="${milkAmountPresets.join(', ')}" placeholder="160, 240"><p class="small">OFFでも大人の対象・過去ログ・メンバー連携は削除されません。</p><div id="familyLogSettingsStatus" class="small" aria-live="polite"></div><button type="submit">保存する</button></form></div></div>`:''}
  <script type="application/json" id="familyLogPayload">${payload}</script><script src="/assets/family-log.js?v=12.137.0-wave118"></script>`;
  const aiEntry=!managementMode&&familyLogIsAdmin?`<details class="family-ai-query"><summary>✨ Family AI</summary><form id="familyAiForm"><input name="question" maxlength="500" placeholder="質問、または予定・記録の追加" required><button type="submit">送る</button></form><div id="familyAiAnswer" class="small" aria-live="polite"></div><div id="familyAiConfirm" class="actions" hidden><button type="button" id="familyAiExecute">実行</button><button type="button" class="btn gray" id="familyAiCancel">キャンセル</button></div></details><script type="application/json" id="familyAiPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''})}</script><script src="/assets/family-ai.js?v=12.126-wave107"></script>`:'';
  const body=(managementMode?managementBody:dailyBody)+aiEntry+sharedControls;
  return html(layout(managementMode?'家族ログ管理':'家族ログ',body,managementMode?'/app/settings.php':'/app/family_log.php'));
}


export async function settingsContent(ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx),role=String(m.role||'').toUpperCase(),admin=role==='OWNER'||role==='ADMIN';
  const [tasks,items,shops,msgs,familyLogs]=await Promise.all([
    ctx.env.DB.prepare(`SELECT id,title,status,created_at,created_by FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} ORDER BY id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.id,i.name,i.status,i.created_at,i.created_by FROM items i WHERE i.family_id=? AND ${taskChildVisibilitySql('i')} ORDER BY i.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.status,s.created_at,s.created_by FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} ORDER BY s.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,text,created_at,sender_id FROM messages WHERE family_id=? ORDER BY id DESC LIMIT 30').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT l.id,l.log_type,l.occurred_at,l.created_at,l.created_by,s.name subject_name FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id WHERE l.family_id=? AND l.deleted_at IS NULL ORDER BY l.occurred_at DESC,l.id DESC LIMIT 30").bind(m.family_id).all<Row>()
  ]);
  const own=(id:unknown)=>admin||Number(id)===m.id;
  const section=(title:string,icon:string,rows:{results:Row[]},link:(r:Row)=>string,name:(r:Row)=>string)=>`<div class="card content-admin"><h2>${icon} ${title}</h2>${rows.results.map(r=>`<div class="content-row"><div><strong>${esc(name(r))}</strong><div class="meta">${esc(r.created_at||'')} / ${esc(r.status||'')}</div></div>${own(r.created_by??r.sender_id)?`<a class="btn gray small" href="${link(r)}">開く</a>`:''}</div>`).join('')||'<p class="empty">ありません。</p>'}</div>`;
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📋 投稿管理</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${section('タスク','📝',tasks,r=>`/task/view.php?id=${r.id}`,r=>String(r.title||''))}${section('持ち物','🎒',items,r=>`/item/edit.php?id=${r.id}`,r=>String(r.name||''))}${section('買い物','🛒',shops,r=>`/app/shopping_edit.php?id=${r.id}`,r=>String(r.name||''))}${section('伝言','💬',msgs,r=>`/app/messages.php`,r=>String(r.text||''))}${section('家族ログ','🐣',familyLogs,r=>`/app/family_log.php?date=${String(r.occurred_at||'').slice(0,10)}`,r=>`${FAMILY_LOG_TYPE_META[String(r.log_type||'MEMO')]?.label||String(r.log_type||'記録')}${r.subject_name?' / '+String(r.subject_name):''}`)}`;
  return html(layout('投稿管理',body,'/app/settings.php'));
}


type DiagnosticDefinition={key:string;label:string;description:string;sql:string;params?:(familyId:number,now:string)=>unknown[]};
const DIAGNOSTIC_DEFINITIONS:DiagnosticDefinition[]=[
  {key:'notification_duplicate',label:'通知の重複グループ',description:'同じ宛先・対象・日時でpending/retryが複数ある状態',sql:"SELECT COUNT(*) c FROM (SELECT member_id,target_type,target_id,notify_at FROM notifications WHERE family_id=? AND status IN ('pending','retry') GROUP BY member_id,target_type,target_id,notify_at HAVING COUNT(*)>1)"},
  {key:'notification_orphan',label:'通知の孤児',description:'削除済みタスク/伝言を指すpending/retry通知',sql:"SELECT COUNT(*) c FROM notifications n WHERE n.family_id=? AND n.status IN ('pending','retry') AND ((n.target_type='task' AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=n.target_id AND t.family_id=n.family_id)) OR (n.target_type='message' AND NOT EXISTS(SELECT 1 FROM messages x WHERE x.id=n.target_id AND x.family_id=n.family_id)))"},
  {key:'recurrence_exception_orphan',label:'定期タスク例外リンクの孤児',description:'存在しない通常タスクをexceptionとして参照',sql:'SELECT COUNT(*) c FROM recurrence_occurrences o WHERE o.family_id=? AND o.exception_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=o.exception_task_id AND t.family_id=o.family_id)'},
  {key:'recurrence_rule_orphan',label:'定期ルールの孤児',description:'元テンプレートtaskが存在しない定期ルール',sql:'SELECT COUNT(*) c FROM recurrence_rules r WHERE r.family_id=? AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=r.task_id AND t.family_id=r.family_id)'},
  {key:'message_link',label:'伝言の変換先リンク切れ',description:'削除済みタスク/買い物を参照',sql:'SELECT COUNT(*) c FROM messages x WHERE x.family_id=? AND ((x.converted_to_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=x.converted_to_task_id AND t.family_id=x.family_id)) OR (x.converted_to_shopping_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.id=x.converted_to_shopping_id AND s.family_id=x.family_id)))'},
  {key:'task_child_link',label:'買い物・持ち物のtaskリンク切れ',description:'存在しないtaskへの紐付け',sql:'SELECT (SELECT COUNT(*) FROM shopping_items s WHERE s.family_id=?1 AND s.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id))+(SELECT COUNT(*) FROM items i WHERE i.family_id=?1 AND i.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id)) c'},
  {key:'archive_duplicate',label:'削除完了履歴の重複',description:'同一履歴の重複',sql:"SELECT COUNT(*) c FROM (SELECT entity_type,entity_id,COALESCE(member_id,-1),action,occurred_at,COALESCE(source_type,''),COALESCE(source_id,-1) FROM deleted_completion_history WHERE family_id=? GROUP BY entity_type,entity_id,COALESCE(member_id,-1),action,occurred_at,COALESCE(source_type,''),COALESCE(source_id,-1) HAVING COUNT(*)>1)"},
  {key:'archive_member',label:'削除完了履歴の家族不一致',description:'履歴memberとfamilyの不一致',sql:'SELECT COUNT(*) c FROM deleted_completion_history h WHERE h.family_id=? AND h.member_id IS NOT NULL AND EXISTS(SELECT 1 FROM members mm WHERE mm.id=h.member_id AND mm.family_id<>h.family_id)'},
  {key:'assignee_orphan',label:'担当者リンクの孤児',description:'元task/item/shoppingが存在しない担当者リンク',sql:'SELECT (SELECT COUNT(*) FROM task_assignees a JOIN members mm ON mm.id=a.member_id WHERE mm.family_id=?1 AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=a.task_id))+(SELECT COUNT(*) FROM item_assignees a JOIN members mm ON mm.id=a.member_id WHERE mm.family_id=?1 AND NOT EXISTS(SELECT 1 FROM items i WHERE i.id=a.item_id))+(SELECT COUNT(*) FROM shopping_assignees a JOIN members mm ON mm.id=a.member_id WHERE mm.family_id=?1 AND NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.id=a.shopping_item_id)) c'},
  {key:'family_log_link',label:'家族ログのリンク不整合',description:'subject/timer/quick choreリンク不整合',sql:"SELECT (SELECT COUNT(*) FROM family_log_subjects s WHERE s.family_id=?1 AND s.member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=s.member_id AND m.family_id=s.family_id))+(SELECT COUNT(*) FROM family_logs l WHERE l.family_id=?1 AND l.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=l.subject_id AND s.family_id=l.family_id))+(SELECT COUNT(*) FROM family_log_timers x WHERE x.family_id=?1 AND x.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=x.subject_id AND s.family_id=x.family_id))+(SELECT COUNT(*) FROM family_logs l WHERE l.family_id=?1 AND l.quick_chore_id IS NOT NULL AND (l.log_type<>'HOUSEWORK' OR NOT EXISTS(SELECT 1 FROM family_quick_chores q WHERE q.id=l.quick_chore_id AND q.family_id=l.family_id))) c"},
  {key:'promotion_invite',label:'LINE本登録招待の不整合',description:'無効対象または本登録済み対象を参照',sql:'SELECT COUNT(*) c FROM family_invitations i WHERE i.family_id=? AND i.family_log_subject_id IS NOT NULL AND i.used_at IS NULL AND i.expires_at>? AND (NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1) OR EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1 AND s.member_id IS NOT NULL))',params:(f,n)=>[f,n]},
  {key:'template_link',label:'定期タスク家族ログ連携の不整合',description:'template/task/subject/log linkage',sql:"SELECT (SELECT COUNT(*) FROM task_family_log_templates ft WHERE ft.family_id=?1 AND (NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=ft.task_id AND t.family_id=ft.family_id) OR (ft.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=ft.subject_id AND s.family_id=ft.family_id AND s.active=1)) OR (ft.log_type='HOUSEWORK' AND ft.subject_id IS NOT NULL) OR (ft.log_type<>'HOUSEWORK' AND ft.subject_id IS NULL)))+(SELECT COUNT(*) FROM family_logs l WHERE l.family_id=?1 AND l.task_family_log_template_id IS NOT NULL AND (l.linked_occurrence_id IS NULL OR NOT EXISTS(SELECT 1 FROM task_family_log_templates ft WHERE ft.id=l.task_family_log_template_id AND ft.family_id=l.family_id))) c"},
  {key:'private_integrity',label:'PRIVATEデータの整合性',description:'owner/担当者/通知の不整合',sql:"SELECT (SELECT COUNT(*) FROM tasks t WHERE t.family_id=?1 AND ((t.visibility_scope='PRIVATE' AND (t.private_owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=t.private_owner_id AND m.family_id=t.family_id AND m.active=1 AND m.deleted_at IS NULL))) OR (t.visibility_scope='FAMILY' AND t.private_owner_id IS NOT NULL)))+(SELECT COUNT(*) FROM task_assignees a JOIN tasks t ON t.id=a.task_id WHERE t.family_id=?1 AND t.visibility_scope='PRIVATE' AND a.member_id<>t.private_owner_id)+(SELECT COUNT(*) FROM item_assignees a JOIN items i ON i.id=a.item_id JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id WHERE t.family_id=?1 AND t.visibility_scope='PRIVATE' AND a.member_id<>t.private_owner_id)+(SELECT COUNT(*) FROM shopping_assignees a JOIN shopping_items i ON i.id=a.shopping_item_id JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id WHERE t.family_id=?1 AND t.visibility_scope='PRIVATE' AND a.member_id<>t.private_owner_id)+(SELECT COUNT(*) FROM notifications n JOIN tasks t ON n.target_type='task' AND t.id=n.target_id AND t.family_id=n.family_id WHERE n.family_id=?1 AND n.status IN ('pending','retry') AND t.visibility_scope='PRIVATE' AND n.member_id<>t.private_owner_id) c"},
  {key:'calendar_health',label:'Google Calendar同期',description:'stuck/orphan/PRIVATE/revoked/missing/stale/sync token error',sql:"SELECT (SELECT COUNT(*) FROM calendar_sync_outbox o WHERE o.family_id=?1 AND o.status='ERROR' AND o.retry_count>=5)+(SELECT COUNT(*) FROM external_calendar_links l WHERE l.family_id=?1 AND (NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=l.task_id AND t.family_id=l.family_id) OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=l.task_id AND t.family_id=l.family_id AND t.visibility_scope='PRIVATE')) AND l.deleted_at IS NULL)+(SELECT COUNT(*) FROM external_calendar_accounts a WHERE a.family_id=?1 AND (a.status='REVOKED' OR (a.status='ACTIVE' AND COALESCE(a.calendar_id,'')='')))+(SELECT COUNT(*) FROM calendar_sync_state s WHERE s.family_id=?1 AND (s.last_synced_at IS NULL OR s.last_synced_at<datetime('now','-2 days'))) c"}
];

function environmentAuditHtml(env:Env):string{const h=integrationsHealth(env);const status=(v:boolean,secret=false)=>v?`設定済み${secret?' Secret':''} ✓`:'未設定 ×';return `<div class="card"><h2>環境変数・外部連携監査</h2><p><strong>実行中: ${APP_VERSION}</strong> / Expected config: Wave117</p><h3>Google Home</h3><p>Client ID: ${status(h.google_home.client_id_present)} / Client Secret: ${status(h.google_home.client_secret_present,true)} / Project ID: ${status(h.google_home.project_id_present)} / OAuth: ${h.google_home.configured?'設定済み ✓':'未設定 ×'}</p><h3>Google Calendar</h3><p>Client ID: ${status(h.google_calendar.client_id_present)} / Client Secret: ${status(h.google_calendar.client_secret_present,true)} / Redirect URI: ${status(h.google_calendar.redirect_uri_present)} / Token Key: ${status(h.google_calendar.token_key_present,true)}</p><h3>Google Tasks / Family AI / Web Push</h3><p>Tasks effective: ${h.google_tasks.configured?'fallback/設定済み ✓':'未設定 ×'} / AI (${h.family_ai.provider}): ${h.family_ai.configured?'設定済み ✓':'未設定 ×'} / Web Push: ${h.web_push.configured?'設定済み ✓':'未設定 ×'}</p><p class="small">値・長さ・tokenは表示しません。診断表示だけでは外部APIを呼びません。</p></div>`;}

export async function settingsDiagnostics(ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx),role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return html(layout('データ診断','<div class="card"><h1>🩺 データ診断</h1><p>管理者権限が必要です。</p></div>','/app/settings.php'));
  const current=familyNow(String((await ctx.env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(m.family_id).first<Row>())?.timezone||DEFAULT_FAMILY_TIMEZONE));
  // Every card is one bounded SELECT. allSettled keeps a single D1 failure from turning the page into HTTP 500.
  const settled=await Promise.allSettled(DIAGNOSTIC_DEFINITIONS.map(d=>ctx.env.DB.prepare(d.sql).bind(...(d.params?.(m.family_id,current)||[m.family_id])).first<Row>()));
  let total=0;const cards=DIAGNOSTIC_DEFINITIONS.map((d,i)=>{const r=settled[i];if(r.status==='rejected')return `<div class="diagnostic-row has-issue"><div><strong>${esc(d.label)}</strong><div class="small">${esc(d.description)}</div><div class="notice">⚠️ この診断を実行できませんでした</div></div><span>--</span></div>`;const count=Number(r.value?.c||0);total+=count;return `<div class="diagnostic-row ${count?'has-issue':'is-ok'}"><div><strong>${esc(d.label)}</strong><div class="small">${esc(d.description)}</div>${count?`<a class="btn gray small" href="/api/settings/diagnostics-detail?issue=${encodeURIComponent(d.key)}">詳細を見る</a>`:''}</div><span class="diagnostic-count">${count}</span></div>`}).join('');
  return html(layout('データ診断',`<div class="page-head"><h1>🩺 データ診断</h1><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card"><div class="section-head"><h2>整合性（初期ロード ${DIAGNOSTIC_DEFINITIONS.length} query）</h2><span>${total?`要確認 ${total}件`:'異常なし'}</span></div><p class="small">詳細は押した時だけ最大20件を取得します。secret、token、Web Push endpoint/鍵は表示しません。</p>${cards}</div>${environmentAuditHtml(ctx.env)}`, '/app/settings.php'));
}

export async function settingsDiagnosticsDetail(request:Request,ctx:AppContext):Promise<Response>{
  const m=requireMember(ctx),role=String(m.role||'').toUpperCase();if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者権限が必要です。'},403);
  const issue=new URL(request.url).searchParams.get('issue')||'';const d=DIAGNOSTIC_DEFINITIONS.find(x=>x.key===issue);if(!d)return json({ok:false,error:'診断キーが不正です。'},400);
  // SQL is server-side allowlisted; never accept SQL from the browser. IDs only avoid leaking content or credentials.
  const rows=await ctx.env.DB.prepare(`SELECT id FROM tasks WHERE family_id=? AND id IN (SELECT task_id FROM external_calendar_links WHERE family_id=?) LIMIT 20`).bind(m.family_id,m.family_id).all<Row>();
  return json({ok:true,issue,items:rows.results.map(x=>({id:Number(x.id)})),limited:20});
}

export async function inviteCreate(request: Request, ctx: AppContext): Promise<Response> {
  const m = requireMember(ctx);
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  const b = await bodyJson(request);
  await ensureCsrf(ctx, b.csrf);
  const role = String(m.role||'').toUpperCase();
  if (role !== 'OWNER' && role !== 'ADMIN') return json({ok:false,error:'管理者権限が必要です。'},403);
  const action=String(b.action||'create');
  if(action==='revoke'){
    const id=Number(b.id||0);if(!id)return json({ok:false,error:'招待IDが不正です。'},400);
    const inv=await ctx.env.DB.prepare('SELECT id,used_at,family_log_subject_id FROM family_invitations WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
    if(!inv)return json({ok:false,error:'招待が見つかりません。'},404);
    if(inv.used_at)return json({ok:false,error:'使用済みの招待は取り消せません。'},400);
    const now=nowJst();await ctx.env.DB.prepare('UPDATE family_invitations SET expires_at=? WHERE id=? AND family_id=? AND used_at IS NULL').bind(now,id,m.family_id).run();
    await logActivity(ctx,'REVOKED','family_invitation',id,{family_log_subject_id:Number(inv.family_log_subject_id||0)||null});return json({ok:true,id});
  }
  if(action!=='create')return json({ok:false,error:'操作が不正です。'},400);
  const subjectId=Number(b.subject_id||0)||0;
  let subject:Row|undefined;
  if(subjectId){
    subject=await ctx.env.DB.prepare('SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(subjectId,m.family_id).first<Row>()||undefined;
    if(!subject)return json({ok:false,error:'本登録する家族ログ対象が見つかりません。'},404);
    if(Number(subject.member_id||0)>0)return json({ok:false,error:'この対象はすでに家族メンバーへ本登録済みです。'},409);
    if(!['BABY','CHILD','ADULT'].includes(familyLogSubjectKind(subject.subject_kind)))return json({ok:false,error:'この対象タイプはLINE本登録の対象外です。'},400);
  }
  const expiresDays = Math.min(30, Math.max(1, Number(b.expires_days||7)));
  const token = `${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(v=>v.toString(16).padStart(2,'0')).join('');
  const expiresDate=new Date(Date.now()+expiresDays*86400000);const expires=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(expiresDate);
  const now=nowJst();
  if(subjectId)await ctx.env.DB.prepare('UPDATE family_invitations SET expires_at=? WHERE family_id=? AND family_log_subject_id=? AND used_at IS NULL AND expires_at>?').bind(now,m.family_id,subjectId,now).run();
  const inserted=await ctx.env.DB.prepare('INSERT INTO family_invitations(family_id,token_hash,created_by,expires_at,created_at,family_log_subject_id) VALUES(?,?,?,?,?,?)').bind(m.family_id,tokenHash,m.id,expires,now,subjectId||null).run();
  const invitationId=Number(inserted.meta.last_row_id||0);
  const base = (ctx.env.APP_URL || new URL(ctx.request.url).origin).replace(/\/$/,'');
  const official = await lineOfficialAccountInfo(ctx.env);
  await logActivity(ctx,'CREATED','family_invitation',invitationId,{expires_at:expires,family_log_subject_id:subjectId||null,subject_name:String(subject?.name||'')});
  if(subjectId)await logActivity(ctx,'INVITED','family_log_subject',subjectId,{invitation_id:invitationId,expires_at:expires});
  return json({ok:true,token,expires_at:expires,url:`${base}/family/join.php?token=${encodeURIComponent(token)}`,official_account:official,subject:subjectId?{id:subjectId,name:String(subject?.name||''),subject_kind:familyLogSubjectKind(subject?.subject_kind)}:null});
}

export async function invitePage(ctx: AppContext, token: string): Promise<Response> {
  const trimmed = token.trim();
  if (!trimmed) return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>招待情報がありません。</p></div>'));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(trimmed));
  const tokenHash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
  const invite=await ctx.env.DB.prepare(`SELECT i.id,i.expires_at,i.used_at,i.family_log_subject_id,s.name subject_name,s.subject_kind
    FROM family_invitations i
    LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1
    WHERE i.token_hash=? LIMIT 1`).bind(tokenHash).first<Row>();
  if(!invite||invite.used_at||String(invite.expires_at||'')<nowJst())return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>この招待リンクは無効・使用済み・期限切れのいずれかです。</p></div>'));
  if(Number(invite.family_log_subject_id||0)>0&&!String(invite.subject_name||'').trim())return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>本登録対象の家族ログプロフィールが無効です。管理者に新しい招待リンクを発行してもらってください。</p></div>'));
  const subjectName=String(invite.subject_name||'').trim();
  const official=await lineOfficialAccountInfo(ctx.env);
  const friendHtml=official
    ? `<div class="invite-official"><div><strong>${esc(official.display_name)}</strong><div class="small">${esc(official.basic_id)}</div></div><a class="btn line-friend-btn" href="${esc(official.add_friend_url)}" target="_blank" rel="noopener noreferrer">LINE公式アカウントを友だち追加</a></div>`
    : `<p class="small">公式アカウント情報を自動取得できませんでした。管理者から共有された友だち追加リンクを利用してください。</p>`;
  const title=subjectName?`${subjectName} のLINE本登録`:'家族に参加';
  const intro=subjectName?`これまで「${esc(subjectName)}」として保存した家族ログを、このLINEアカウントへ引き継いで本登録します。`:'この招待リンクから家族に参加できます。';
  const defaultName=subjectName||String(ctx.session.lineDisplayName||'');
  return html(layout('家族に参加',`<div class="card"><h1>${esc(title)}</h1><p>${intro}</p><div class="invite-guide"><strong>参加前に確認</strong><ol><li>Family TODO LINE 公式アカウントを友だち追加</li><li>このページをLINE内で開く</li><li>名前を確認して参加</li></ol>${friendHtml}</div><div id="familyActionError" class="error" style="display:none"></div><form id="join" data-family-endpoint="/api/family/join"><input type="hidden" name="token" value="${esc(trimmed)}"><label>あなたの名前</label><input name="member_name" value="${esc(defaultName)}" required><button>${subjectName?'本登録して参加する':'家族に参加する'}</button></form></div><script src="/assets/family-onboarding.js?v=12.97-wave78"></script>`));
}

export async function recurring(request: Request, ctx: AppContext): Promise<Response> {
  const m = requireMember(ctx);
  const role = String(m.role || '').toUpperCase();
  const isAdmin = role === 'OWNER' || role === 'ADMIN';
  if (!isAdmin) return request.method === 'GET'
    ? html(layout('定期タスク', '<div class="card"><h1>🔁 定期タスク</h1><p>定期タスクの管理には管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>', '/app/settings.php'))
    : json({ok:false,error:'管理者権限が必要です。'},403);

  // Wave55: JSON fetchだけでなく通常のHTML form POSTも受けられるようにする。
  // LINE WebViewでinline JSが途中停止しても、登録ボタン自体は必ずWorkerへ到達できる。
  const bodyValues = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
  };
  const numberValues = (value: unknown, min: number, max: number): number[] =>
    [...new Set(bodyValues(value).flatMap(v=>String(v).split(',')).map(v=>Number(String(v).trim())).filter(n=>Number.isInteger(n)&&n>=min&&n<=max))];
  const stringValues = (value: unknown): string[] =>
    bodyValues(value).map(v=>String(v).trim()).filter(Boolean);
  const postSuccess = (payload: Record<string, unknown>, result: 'saved'|'deleted'|'toggled'|'restored'='saved') => {
    const accepts = (request.headers.get('accept') || '').toLowerCase();
    const response = accepts.includes('text/html') && !accepts.includes('application/json')
      ? redirect('/app/recurring.php?result='+encodeURIComponent(result))
      : json({ok:true,result,...payload});
    return commitSession(response, ctx.session, ctx.env.APP_SECRET);
  };

  if (request.method === 'POST') {
    const b = await bodyJson(request);
    await ensureCsrf(ctx, b.csrf);
    const action = String(b.action || 'create');
    // All Family Log input errors are resolved before any recurrence/task mutation.
    const validatedFamilyLogTemplate=await validateTaskFamilyLogTemplateInput(ctx,b);

    if (action === 'toggle') {
      const id = Number(b.id || 0);
      if (!id) throw new BadRequest('対象が不正です。');
      const active = b.active ? 1 : 0;
      const now = nowJst();
      const result = await ctx.env.DB.prepare('UPDATE recurrence_rules SET active=?,updated_at=? WHERE id=? AND family_id=?')
        .bind(active, now, id, m.family_id).run();
      if (!result.meta.changes) return json({ok:false,error:'定期タスクが見つかりません。'},404);
      if (!active) {
        const rule = await ctx.env.DB.prepare('SELECT task_id FROM recurrence_rules WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();
        const taskId = Number(rule?.task_id || 0);
        if (taskId) await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry')").bind(now,m.family_id,taskId).run();
      }
      return postSuccess({},'toggled');
    }

    if (action === 'restore_excluded') {
      const occurrenceId = Number(b.occurrence_id || 0);
      if (!occurrenceId) throw new BadRequest('発生日が不正です。');
      const excluded = await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status,r.* FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? AND o.status='excluded' LIMIT 1`)
        .bind(occurrenceId,m.family_id).first<Row>();
      if (!excluded) return json({ok:false,error:'除外済み発生日が見つかりません。'},404);
      const occurrenceDate=String(excluded.occurrence_date||'');
      if (occurrenceDate<String(excluded.start_date||'') || (excluded.end_date && occurrenceDate>String(excluded.end_date)) || !matchesRecurrence(excluded,occurrenceDate))
        throw new BadRequest('現在の定期ルールではこの日を復活できません。');
      const now=nowJst();
      await ctx.env.DB.prepare("UPDATE recurrence_occurrences SET status='pending',exception_task_id=NULL,completed_by=NULL,completed_at=NULL,updated_at=? WHERE id=? AND family_id=? AND status='excluded'")
        .bind(now,occurrenceId,m.family_id).run();
      await logActivity(ctx,'RESTORED','recurrence_occurrence',occurrenceId,{occurrence_date:occurrenceDate,recurrence_rule_id:Number(excluded.id||0)});
      return postSuccess({occurrence_id:occurrenceId},'restored');
    }

    if (action === 'delete') {
      const id = Number(b.id || 0);
      if (!id) throw new BadRequest('対象が不正です。');
      const rule = await ctx.env.DB.prepare('SELECT id,task_id FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1')
        .bind(id, m.family_id).first<Row>();
      if (!rule) return json({ok:false,error:'定期タスクが見つかりません。'},404);
      const taskId = Number(rule.task_id || 0);
      const deleteNow=nowJst();
      const statements:any[] = [
        ...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,id,deleteNow),
        ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(id,m.family_id)
      ];
      if (taskId) {
        statements.unshift(ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),taskId,m.family_id));
        statements.push(ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id));
        statements.push(ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id));
        statements.push(...archiveTaskChildCompletionStatements(ctx.env.DB,m.family_id,taskId,nowJst()));
        statements.push(ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id));
        statements.push(ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id));
        statements.push(ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(taskId));
        statements.push(...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,taskId,nowJst()));
        statements.push(ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(taskId,m.family_id));
      }
      await ctx.env.DB.batch(statements);
      await logActivity(ctx,'DELETED','recurrence_rule',id,{task_id:taskId});
      return postSuccess({},'deleted');
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
      const allowed = ['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY','YEARLY'];
      if (!title || title.length > 255) throw new BadRequest('タイトルを入力してください。');
      if (!allowed.includes(type)) throw new BadRequest('繰り返し種類が不正です。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequest('開始日が不正です。');
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
      if (endDate && endDate < startDate) throw new BadRequest('終了日は開始日以降にしてください。');
      const interval = Math.max(1, Math.min(365, Number(b.interval_value || 1)));
      const weekdays = numberValues(b.weekdays,0,6);
      const monthdays = numberValues(b.monthdays,1,31);
      const weekNumber = Math.max(1, Math.min(5, Number(b.week_number || 1)));
      const weekNumbers = numberValues(b.week_numbers,1,5);
      const effectiveWeekNumbers = weekNumbers.length ? [...new Set(weekNumbers)] : [weekNumber];
      const businessOrdinal = Math.max(1, Math.min(23, Number(b.business_day_ordinal || 1)));
      const completionMode = String(b.completion_mode || 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
      const description = String(b.description || '').trim() || null;
      const location = String(b.location || '').trim() || null;
      const startTime = String(b.start_time || '').trim();
      const endTime = String(b.end_time || '').trim();
      const allDay = b.all_day ? 1 : 0;
      const calendarVisible = b.calendar_visible === false || String(b.calendar_visible) === '0' ? 0 : 1;
      const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
      const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
      const startAt = allDay || !startTime ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
      const endAt = allDay || !endTime ? null : `${startDate} ${endTime}:00`;
      if (startAt && endAt && endAt < startAt) throw new BadRequest('終了時刻は開始時刻以降にしてください。');
      const now = nowJst();
      const assignees = numberValues(b.assignees,1,2147483647);
      const shopping = Array.isArray(b.shopping)
        ? (b.shopping as unknown[]).slice(0,50)
        : (()=>{
            const names=stringValues(b['shopping_name[]']);
            const qty=bodyValues(b['shopping_quantity[]']).map(String);
            const urls=bodyValues(b['shopping_url[]']).map(String);
            return names.slice(0,50).map((name,i)=>({name,quantity:String(qty[i]||'1').trim()||'1',url:String(urls[i]||'').trim(),category:String(b.shopping_category||'').trim()}));
          })();
      const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):stringValues(b['item_name[]']).slice(0,50);
      for(const v of shopping){const u=String((v as any)?.url||'').trim();if(u){try{const parsed=new URL(u);if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error();}catch{throw new BadRequest('買い物URLが不正です。');}}}

      // Wave66: 「指定日以降だけ変更」は既存シリーズをその日で分割する。
      if(String(b.edit_scope||'all')==='future'){
        const currentRule=await ctx.env.DB.prepare('SELECT start_date,end_date FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
        const effectiveDate=String(b.effective_date||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))throw new BadRequest('変更を開始する日が不正です。');
        const currentStart=String(currentRule?.start_date||'');
        const currentEnd=String(currentRule?.end_date||'');
        if(currentStart&&effectiveDate<=currentStart)throw new BadRequest('開始日から変更する場合は「この定期タスク全体」を選んでください。');
        if(currentEnd&&effectiveDate>currentEnd)throw new BadRequest('変更開始日は現在の終了日以前にしてください。');
        if(endDate&&endDate<effectiveDate)throw new BadRequest('終了日は変更開始日以降にしてください。');
        const prevDate=(()=>{const d=new Date(`${effectiveDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)})();
        const futureStartAt=allDay||!startTime?`${effectiveDate} 00:00:00`:`${effectiveDate} ${startTime}:00`;
        const futureEndAt=allDay||!endTime?null:`${effectiveDate} ${endTime}:00`;
        if(futureEndAt&&futureEndAt<futureStartAt)throw new BadRequest('終了時刻は開始時刻以降にしてください。');

        // 例外タスク化済みの発生日は通常タスクとして独立しているので残す。
        // それ以外の将来発生日は新ルールで再生成するため、完了履歴をarchiveして除去する。
        await ctx.env.DB.batch([
          ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry') AND date(notify_at)>=date(?)").bind(now,m.family_id,taskId,effectiveDate),
          ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', c.occurrence_id, c.member_id, 'COMPLETED', c.completed_at, 'recurrence_split_future', c.occurrence_id, ? FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id WHERE o.family_id=? AND o.recurrence_rule_id=? AND o.occurrence_date>=? AND o.exception_task_id IS NULL AND o.status<>'excluded'").bind(m.family_id,now,m.family_id,id,effectiveDate),
          ctx.env.DB.prepare("DELETE FROM recurrence_occurrence_completions WHERE occurrence_id IN (SELECT id FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded')").bind(m.family_id,id,effectiveDate),
          ctx.env.DB.prepare("DELETE FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded'").bind(m.family_id,id,effectiveDate),
          ctx.env.DB.prepare('UPDATE recurrence_rules SET end_date=?,updated_at=? WHERE id=? AND family_id=?').bind(prevDate,now,id,m.family_id)
        ]);

        const newTask=await ctx.env.DB.prepare(`INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
          .bind(m.family_id,title,description,futureStartAt,'pending',completionMode,m.id,now,now,futureStartAt,futureEndAt,location,allDay,calendarVisible,calendarColor,'RECURRING',null).run();
        const newTaskId=Number(newTask.meta.last_row_id);
        const newRule=await ctx.env.DB.prepare(`INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,created_at,updated_at,week_number,business_day_ordinal,weekdays_json,monthdays_json,week_numbers_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`)
          .bind(m.family_id,newTaskId,title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,effectiveDate,endDate||null,now,now,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers)).run();
        const newRuleId=Number(newRule.meta.last_row_id);
        await ctx.env.DB.prepare('UPDATE tasks SET recurrence_rule=? WHERE id=? AND family_id=?').bind(JSON.stringify({recurrence_rule_id:newRuleId}),newTaskId,m.family_id).run();
        if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(newTaskId,mid,m.family_id)));
        for(const v of shopping){const o=v as any;const name=String(o?.name||'').trim();if(!name)continue;const qty=String(o?.quantity||'1').trim()||'1';const url=String(o?.url||'').trim()||null;const category=String(o?.category||b.shopping_category||'').trim()||null;const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,effectiveDate,m.id,now,now,newTaskId,url).run();const sid=Number(sr.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
        for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${effectiveDate} 00:00:00`,m.id,now,now,newTaskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();const iid=Number(ir.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}
        await saveTaskFamilyLogTemplate(ctx,newTaskId,b,validatedFamilyLogTemplate);
        await logActivity(ctx,'SPLIT_FUTURE','recurrence_rule',id,{task_id:taskId,new_rule_id:newRuleId,new_task_id:newTaskId,effective_date:effectiveDate});
        return postSuccess({id:newRuleId,task_id:newTaskId,split_from:id,effective_date:effectiveDate});
      }

      const statements = [
        ctx.env.DB.prepare(`UPDATE recurrence_rules SET name=?,recurrence_type=?,interval_value=?,weekday=?,monthday=?,start_date=?,end_date=?,week_number=?,business_day_ordinal=?,weekdays_json=?,monthdays_json=?,week_numbers_json=?,updated_at=? WHERE id=? AND family_id=?`).bind(title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers),now,id,m.family_id),
        ctx.env.DB.prepare(`UPDATE tasks SET title=?,description=?,due_at=?,completion_mode=?,updated_at=?,start_at=?,end_at=?,location=?,calendar_visible=?,all_day=?,calendar_color=? WHERE id=? AND family_id=?`).bind(title,description,startAt,completionMode,now,startAt,endAt,location,calendarVisible,allDay,calendarColor,taskId,m.family_id),
        ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry')").bind(now,m.family_id,taskId)
      ];
      await ctx.env.DB.batch(statements);
      // Future pending occurrence cache is disposable and may no longer match the edited rule.
      // Preserve exception rows and any completed occurrence history.
      await ctx.env.DB.prepare("DELETE FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded' AND NOT EXISTS (SELECT 1 FROM recurrence_occurrence_completions c WHERE c.occurrence_id=recurrence_occurrences.id)").bind(m.family_id,id,dateOnly()).run();
      await ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(taskId).run();
      if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(taskId,mid,m.family_id)));
      await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?)').bind(taskId,taskId).run();
      await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?) AND occurrence_id IN (SELECT o.id FROM recurrence_occurrences o WHERE o.recurrence_rule_id=? AND o.family_id=?)').bind(taskId,id,m.family_id).run();
      await ctx.env.DB.prepare("UPDATE recurrence_occurrences SET status=CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? )=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=recurrence_occurrences.id) > 0 AND (SELECT completion_mode FROM tasks WHERE id=?) <> 'ALL' THEN 'completed' WHEN (SELECT completion_mode FROM tasks WHERE id=?)='ALL' AND (SELECT COUNT(*) FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=recurrence_occurrences.id) >= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?) THEN 'completed' ELSE 'pending' END,updated_at=? WHERE recurrence_rule_id=? AND family_id=? AND status<>'excluded'").bind(taskId,taskId,taskId,taskId,taskId,taskId,now,id,m.family_id).run();
      // 子要素を全置換する場合も、担当・完了履歴を先に整理してライフサイクルを壊さない。
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id),
        ...archiveTaskChildCompletionStatements(ctx.env.DB,m.family_id,taskId,nowJst()),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id),
        ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id)
      ]);
      for(const v of shopping){ const o=v as any; const name=String(o?.name||'').trim(); if(!name) continue; const qty=String(o?.quantity||'1').trim()||'1'; const url=String(o?.url||'').trim()||null; const category=String(o?.category||b.shopping_category||'').trim()||null; const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,startDate,m.id,now,now,taskId,url).run(); const sid=Number(sr.meta.last_row_id); if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id))); }
      for(const name of itemNames){ const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${startDate} 00:00:00`,m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run(); const iid=Number(ir.meta.last_row_id); if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id))); }
      await saveTaskFamilyLogTemplate(ctx,taskId,b,validatedFamilyLogTemplate);
      await logActivity(ctx,'UPDATED','recurrence_rule',id,{task_id:taskId});
      return postSuccess({});
    }

    // create
    const title = String(b.title || '').trim();
    const type = String(b.recurrence_type || 'DAILY').trim();
    const startDate = String(b.start_date || '').trim();
    const endDate = String(b.end_date || '').trim();
    const allowed = ['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY','YEARLY'];
    if (!title || title.length > 255) throw new BadRequest('タイトルを入力してください。');
    if (!allowed.includes(type)) throw new BadRequest('繰り返し種類が不正です。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequest('タイトルと開始日を入力してください。');
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
    if (endDate && endDate < startDate) throw new BadRequest('終了日は開始日以降にしてください。');
    const interval = Math.max(1, Math.min(365, Number(b.interval_value || 1)));
    const weekdays = numberValues(b.weekdays,0,6);
    const monthdays = numberValues(b.monthdays,1,31);
    const weekNumber = Math.max(1, Math.min(5, Number(b.week_number || 1)));
    const weekNumbers = numberValues(b.week_numbers,1,5);
    const effectiveWeekNumbers = weekNumbers.length ? [...new Set(weekNumbers)] : [weekNumber];
    const businessOrdinal = Math.max(1, Math.min(23, Number(b.business_day_ordinal || 1)));
    const completionMode = String(b.completion_mode || 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
    const description = String(b.description || '').trim() || null;
    const location = String(b.location || '').trim() || null;
    const startTime = String(b.start_time || '').trim();
    const endTime = String(b.end_time || '').trim();
    const allDay = b.all_day ? 1 : 0;
    const calendarVisible = b.calendar_visible === false || String(b.calendar_visible) === '0' ? 0 : 1;
    const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
    const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
    const startAt = allDay || !startTime ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
    const endAt = allDay || !endTime ? null : `${startDate} ${endTime}:00`;
    if (endAt && endAt < startAt) throw new BadRequest('終了時刻は開始時刻以降にしてください。');
    const now = nowJst();
    const taskR = await ctx.env.DB.prepare(`INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
      .bind(m.family_id,title,description,startAt,'pending',completionMode,m.id,now,now,startAt,endAt,location,allDay,calendarVisible,calendarColor,'RECURRING',null).run();
    const taskId = Number(taskR.meta.last_row_id);
    const ruleR = await ctx.env.DB.prepare(`INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,created_at,updated_at,week_number,business_day_ordinal,weekdays_json,monthdays_json,week_numbers_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`)
      .bind(m.family_id,taskId,title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,now,now,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers)).run();
    const ruleId = Number(ruleR.meta.last_row_id);
    await ctx.env.DB.prepare('UPDATE tasks SET recurrence_rule=? WHERE id=? AND family_id=?').bind(JSON.stringify({recurrence_rule_id:ruleId}),taskId,m.family_id).run();
    const assignees = numberValues(b.assignees,1,2147483647);
    if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(taskId,mid,m.family_id)));
    const shopping = Array.isArray(b.shopping)
        ? (b.shopping as unknown[]).slice(0,50)
        : (()=>{
            const names=stringValues(b['shopping_name[]']);
            const qty=bodyValues(b['shopping_quantity[]']).map(String);
            const urls=bodyValues(b['shopping_url[]']).map(String);
            return names.slice(0,50).map((name,i)=>({name,quantity:String(qty[i]||'1').trim()||'1',url:String(urls[i]||'').trim(),category:String(b.shopping_category||'').trim()}));
          })();
    for(const v of shopping){ const o=v as any; const name=String(o?.name||'').trim(); if(!name) continue; const qty=String(o?.quantity||'1').trim()||'1'; const url=String(o?.url||'').trim()||null; const category=String(o?.category||b.shopping_category||'').trim()||null; const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,startDate,m.id,now,now,taskId,url).run(); const sid=Number(sr.meta.last_row_id); if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id))); }
    const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):stringValues(b['item_name[]']).slice(0,50);
    for(const name of itemNames){ const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${startDate} 00:00:00`,m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run(); const iid=Number(ir.meta.last_row_id); if(assignees.length) await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id))); }
    await saveTaskFamilyLogTemplate(ctx,taskId,b,validatedFamilyLogTemplate);
    await logActivity(ctx,'CREATED','recurrence_rule',ruleId,{task_id:taskId});
    return postSuccess({id:ruleId,task_id:taskId});
  }

  await ensureFamilyLogMemberSubjects(ctx,m.family_id,m.id);
  const recurringLogSubjects=await ctx.env.DB.prepare('SELECT id,name,subject_kind FROM family_log_subjects WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const rows = await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id,(SELECT GROUP_CONCAT(ta.member_id,',') FROM task_assignees ta WHERE ta.task_id=t.id) assignee_ids FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? ORDER BY r.active DESC,r.id DESC`).bind(m.family_id).all<Row>();
  const recurringTemplates=await ctx.env.DB.prepare('SELECT * FROM task_family_log_templates WHERE family_id=? AND active=1').bind(m.family_id).all<Row>();const templateByTask=new Map(recurringTemplates.results.map(x=>[Number(x.task_id),x]));
  const recurringChildren=await Promise.all(rows.results.map(async r=>{
    const [shops,items]=await Promise.all([
      ctx.env.DB.prepare('SELECT name,quantity,category,url FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(r.task_id),m.family_id).all<Row>(),
      ctx.env.DB.prepare('SELECT name FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(r.task_id),m.family_id).all<Row>()
    ]);
    return {shopping:shops.results.map(x=>({name:String(x.name||''),quantity:String(x.quantity||'1'),category:String(x.category||''),url:String(x.url||'')})),items:items.results.map(x=>String(x.name||''))};
  }));
  const splitLogs=await ctx.env.DB.prepare("SELECT target_id,metadata FROM activity_logs WHERE family_id=? AND action='SPLIT_FUTURE' AND target_type='recurrence_rule' ORDER BY occurred_at,id").bind(m.family_id).all<Row>();
  const parentByRule=new Map<number,number>(),childByRule=new Map<number,number>();
  for(const log of splitLogs.results){
    try{const meta=JSON.parse(String(log.metadata||'{}'));const oldId=Number(log.target_id||0),newId=Number(meta.new_rule_id||0);if(oldId&&newId){childByRule.set(oldId,newId);parentByRule.set(newId,oldId);}}catch{}
  }
  const titleByRule=new Map(rows.results.map(r=>[Number(r.id),String(r.title||r.name||'定期タスク')]));
  const excludedRaw=await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status,r.*,t.title FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE o.family_id=? AND o.status='excluded' AND r.start_date<=o.occurrence_date AND (r.end_date IS NULL OR r.end_date>=o.occurrence_date) ORDER BY o.occurrence_date DESC,o.id DESC LIMIT 100`).bind(m.family_id).all<Row>();
  const excludedRows=excludedRaw.results.filter(x=>matchesRecurrence(x,String(x.occurrence_date||'')));
  const csrf = esc(ctx.session.csrfToken || '');
  const ruleJson = rows.results.map((r,ri) => JSON.stringify({
    id:Number(r.id), title:String(r.title||r.name||''), description:String(r.description||''), recurrence_type:String(r.recurrence_type||'DAILY'), interval_value:Number(r.interval_value||1),
    start_date:String(r.start_date||''), end_date:String(r.end_date||''), weekdays:parseJsonArray(r.weekdays_json), monthdays:parseJsonArray(r.monthdays_json), week_numbers:parseJsonArray(r.week_numbers_json), week_number:Number(r.week_number||1), business_day_ordinal:Number(r.business_day_ordinal||1),
    completion_mode:String(r.completion_mode||'ANY'), location:String(r.location||''), calendar_color:String(r.calendar_color||'#7c3aed'), assignees:String(r.assignee_ids||'').split(',').filter(Boolean).map(Number), all_day:Number(r.all_day??1)===1, calendar_visible:Number(r.calendar_visible??1)===1,
    start_time:String(r.start_at||'').slice(11,16), end_time:String(r.end_at||'').slice(11,16), family_log_template:templateByTask.get(Number(r.task_id))||null, shopping:recurringChildren[ri]?.shopping||[], items:recurringChildren[ri]?.items||[]
  })).map(x=>x.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
  const rowsHtml = rows.results.map((r,i)=>{const rid=Number(r.id),parent=parentByRule.get(rid),child=childByRule.get(rid);const lineage=[parent?`<span class="rec-lineage-badge">← 分割元: ${esc(titleByRule.get(parent)||'#'+parent)}</span>`:'',child?`<span class="rec-lineage-badge">次シリーズ: ${esc(titleByRule.get(child)||'#'+child)} →</span>`:''].filter(Boolean).join('');return `<div class="row rec-rule-row"><strong>${esc(r.title)}</strong><div class="meta">${esc(r.recurrence_type)} / ${esc(r.interval_value)} ・ ${esc(r.start_date)}${r.end_date?' ～ '+esc(r.end_date):''} ・ ${Number(r.active)?'有効':'停止'}</div>${lineage?`<div class="rec-lineage">${lineage}</div>`:''}<div class="rec-row-actions"><button type="button" class="btn gray rec-edit" data-rule="${ruleJson[i]}">編集</button><form method="post" action="/app/recurring.php" class="rec-inline-form rec-toggle-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="active" value="${Number(r.active)?0:1}"><button type="submit" class="btn gray rec-toggle" data-id="${r.id}" data-active="${Number(r.active)?1:0}">${Number(r.active)?'停止':'再開'}</button></form><form method="post" action="/app/recurring.php" class="rec-inline-form rec-delete-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn danger rec-delete" data-id="${r.id}">削除</button></form></div></div>`;}).join('');
  const excludedHtml=excludedRows.map(x=>`<div class="row rec-excluded-row"><div><strong>${esc(x.title||x.name||'定期タスク')}</strong><div class="meta">${esc(String(x.occurrence_date||''))} ・ この日だけ除外</div></div><form method="post" action="/app/recurring.php" class="rec-inline-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="restore_excluded"><input type="hidden" name="occurrence_id" value="${x.occurrence_id}"><button type="submit" class="btn gray small">復活する</button></form></div>`).join('');
  const recurringConfig=JSON.stringify({csrf:ctx.session.csrfToken||'',today:dateOnly()}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body = `<div class="page-head"><h1>🔁 定期タスク</h1><a class="btn" href="/app/settings.php">管理へ戻る</a></div>
  <div class="card"><h2 id="recHeading">定期タスクを作成</h2>${(()=>{const result=new URL(request.url).searchParams.get('result');return result==='deleted'?'<div class="notice success">定期タスクを削除しました。</div>':result==='toggled'?'<div class="notice success">定期タスクの状態を更新しました。</div>':result==='saved'?'<div class="notice success">定期タスクを保存しました。</div>':result==='restored'?'<div class="notice success">除外していた発生日を復活しました。</div>':''})()}<form id="recForm" method="post" action="/app/recurring.php" novalidate><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="create"><input type="hidden" name="id" value=""><div id="recEditScope" class="rec-edit-scope" style="display:none"><label>変更範囲</label><select name="edit_scope" id="recEditScopeSelect"><option value="all">この定期タスク全体</option><option value="future">指定日以降だけ変更</option></select><div id="recEffectiveDateWrap" style="display:none"><label>変更を開始する日</label><input type="date" name="effective_date" value="${dateOnly()}"><p class="small">この日より前の履歴・発生日は現在の定期タスクに残します。</p></div></div><label>タイトル</label><input name="title" maxlength="255" required><label>説明</label><textarea name="description"></textarea><label>種類</label><select name="recurrence_type"><option value="DAILY">毎日</option><option value="INTERVAL_DAYS">n日ごと</option><option value="WEEKLY">毎週</option><option value="INTERVAL_WEEKS">n週ごと</option><option value="MONTHLY_DAY">毎月指定日</option><option value="MONTHLY_WEEKDAY">毎月第n曜日</option><option value="MONTHLY_BUSINESS_DAY">毎月第n営業日</option><option value="YEARLY">毎年</option></select><div class="rec-conditional" data-rec-show="INTERVAL_DAYS,INTERVAL_WEEKS" style="display:none"><label>間隔</label><input type="number" name="interval_value" value="1" min="1" max="365"><p class="small">「n日ごと」「n週ごと」のときだけ使用します。</p></div><label>開始日</label><input type="date" name="start_date" value="${dateOnly()}" required><label>終了日（任意）</label><input type="date" name="end_date"><div class="rec-conditional" data-rec-show="WEEKLY,INTERVAL_WEEKS,MONTHLY_WEEKDAY" style="display:none"><label>曜日</label><div>${['日','月','火','水','木','金','土'].map((x,i)=>`<label style="display:inline-block;margin-right:10px"><input type="checkbox" name="weekdays" value="${i}">${x}</label>`).join('')}</div></div><div class="rec-conditional" data-rec-show="MONTHLY_WEEKDAY" style="display:none"><label>第n曜日（複数選択可）</label><div class="nth-week-list">${[1,2,3,4,5].map(n=>`<label class="checkrow inline-check"><input type="checkbox" name="week_numbers" value="${n}">第${n}</label>`).join('')}</div></div><div class="rec-conditional" data-rec-show="MONTHLY_DAY" style="display:none"><label>毎月指定日</label><input name="monthdays" placeholder="1,15,25"></div><div class="rec-conditional" data-rec-show="MONTHLY_BUSINESS_DAY" style="display:none"><label>第n営業日</label><input type="number" name="business_day_ordinal" value="1" min="1" max="23"></div><label class="checkrow"><input type="checkbox" name="all_day" checked> 終日</label><div class="rec-time-fields compact-time-fields" style="display:none"><div><label>開始時刻</label><input type="time" name="start_time"></div><div><label>終了時刻</label><input type="time" name="end_time"></div></div><label>場所</label><input name="location"><label>担当者</label><div class="assignee-list">${(await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>()).results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label><input type="checkbox" name="calendar_visible" checked> カレンダーに表示</label><div id="recCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div><div class="sub-card"><button type="button" class="section-button" id="recShopToggle">＋ この定期タスクに買い物を追加</button><div id="recShopBox" style="display:none"><label>カテゴリー</label><input name="shopping_category" placeholder="例：食品"><div id="recShopRows"><div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div></div><button type="button" class="btn gray small" id="recAddShop">＋ 商品を追加</button></div></div><div class="sub-card"><button type="button" class="section-button" id="recItemToggle">＋ この定期タスクに持ち物を追加</button><div id="recItemBox" style="display:none"><div id="recItemRows"><div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div></div><button type="button" class="btn gray small" id="recAddItem">＋ 持ち物を追加</button></div></div><details class="sub-card family-log-template"><summary>🐣 家族ログ連携（任意）</summary><label class="checkrow"><input type="checkbox" name="family_log_enabled"> 記録して完了を有効にする</label><div id="recFamilyLogFields" style="display:none"><label>記録対象</label><select name="family_log_subject_id"><option value="">選択してください</option>${recurringLogSubjects.results.map(x=>`<option value="${x.id}">${esc(familyLogSubjectIcon(x))} ${esc(x.name)}</option>`).join('')}</select><label>記録種類</label><select name="family_log_type">${FAMILY_LOG_TYPES.map(type=>`<option value="${type}">${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</option>`).join('')}</select><label>詳細</label><select name="family_log_detail_code"><option value="">指定なし</option>${Object.entries(FAMILY_LOG_DETAILS).map(([code,label])=>`<option value="${code}">${esc(label)}</option>`).join('')}</select><label>数値</label><input type="number" step="any" name="family_log_amount"><label>単位</label><input name="family_log_unit" maxlength="40"><label>時間（分）</label><input type="number" name="family_log_duration_minutes" min="0" max="10080"><label>テキスト</label><input name="family_log_value_text" maxlength="255"><label>メモ</label><textarea name="family_log_note" maxlength="2000"></textarea><p class="small">HOUSEWORKは家族共通（対象なし）として保存します。ログを削除してもタスク完了は取り消されません。</p></div></details><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">全員が完了</option></select><div id="recStatus" class="small rec-status" aria-live="polite">登録機能を準備しています…</div><noscript><p class="small">JavaScriptが無効でも通常送信で登録できます。</p></noscript><div style="display:flex;gap:8px"><button type="submit" id="recSubmit">定期タスクを作成</button><button type="button" id="recCancel" class="btn gray" style="display:none">編集をキャンセル</button></div></form></div>
  <div class="card"><h2>登録済み</h2>${rowsHtml||'<p>ありません。</p>'}</div>
  ${excludedHtml?`<div class="card"><h2>除外した発生日</h2><p class="small">「この日だけ除外」の日を後から定期予定へ戻せます。</p>${excludedHtml}</div>`:''}
  <script type="application/json" id="recurringConfig">${recurringConfig}</script>
  <script src="/assets/recurring.js?v=12.101-wave82"></script>
`;
  return html(layout('定期タスク', body, '/app/settings.php'));
}
