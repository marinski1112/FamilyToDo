import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { integrationsHealth } from './environment-health';
import { lineTokenExchangeDiagnostic } from './line-oauth-diagnostics';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { DEFAULT_FAMILY_TIMEZONE, familyNow } from './timezone';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;
type DiagnosticDefinition={key:string;label:string;description:string;sql:string;params?:(familyId:number,now:string)=>unknown[]};

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

export const DIAGNOSTIC_DEFINITIONS:DiagnosticDefinition[]=[
  {key:'task_range',label:'タスク期間の不正・逆転',description:'開始/終了日時が不正、または終了が開始より前のタスク',sql:"SELECT COUNT(*) c FROM tasks WHERE family_id=? AND start_at IS NOT NULL AND (datetime(start_at) IS NULL OR date(substr(start_at,1,10), '+0 days') IS NULL OR date(substr(start_at,1,10), '+0 days')<>substr(start_at,1,10) OR (end_at IS NOT NULL AND (datetime(end_at) IS NULL OR date(substr(end_at,1,10), '+0 days') IS NULL OR date(substr(end_at,1,10), '+0 days')<>substr(end_at,1,10) OR datetime(end_at)<datetime(start_at))))"},
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

function environmentAuditHtml(env:Env):string{
  const h=integrationsHealth(env);
  const status=(v:boolean,secret=false)=>v?`設定済み${secret?' Secret':''} ✓`:'未設定 ×';
  return `<div class="card"><h2>環境変数・外部連携監査</h2><p><strong>実行中: ${APP_VERSION}</strong> / Expected config: ${h.version.expected_config}</p><h3>Google Home</h3><p>Client ID: ${status(h.google_home.client_id_present)} / Client Secret: ${status(h.google_home.client_secret_present,true)} / Project ID: ${status(h.google_home.project_id_present)} / OAuth: ${h.google_home.configured?'設定済み ✓':'未設定 ×'}</p><h3>LINE Login Web OAuth</h3><p>Channel ID: ${status(h.line_login.channel_id_present)} / Channel Secret: ${status(h.line_login.channel_secret_present,true)} / Callback: ${status(h.line_login.callback_present)} / Mode: ${h.line_login.mode} / 最終token exchange: ${lineTokenExchangeDiagnostic()}</p><h3>Google Calendar</h3><p>Client ID: ${status(h.google_calendar.client_id_present)} / Client Secret: ${status(h.google_calendar.client_secret_present,true)} / Redirect URI: ${status(h.google_calendar.redirect_uri_present)} / Token Key: ${status(h.google_calendar.token_key_present,true)}</p><h3>Google Tasks / Family AI / Web Push</h3><p>Tasks effective: ${h.google_tasks.configured?'fallback/設定済み ✓':'未設定 ×'} / AI (${h.family_ai.provider}): ${h.family_ai.configured?'設定済み ✓':'未設定 ×'} / Web Push: ${h.web_push.configured?'設定済み ✓':'未設定 ×'}</p><p class="small">値・長さ・tokenは表示しません。診断表示だけでは外部APIを呼びません。</p></div>`;
}

export async function settingsDiagnostics(ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_diagnostics.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return html(layout('データ診断','<div class="card"><h1>🩺 データ診断</h1><p>管理者権限が必要です。</p></div>','/app/settings.php'));
  const current=familyNow(String((await ctx.env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(m.family_id).first<Row>())?.timezone||DEFAULT_FAMILY_TIMEZONE));
  const settled=await Promise.allSettled(DIAGNOSTIC_DEFINITIONS.map(d=>ctx.env.DB.prepare(d.sql).bind(...(d.params?.(m.family_id,current)||[m.family_id])).first<Row>()));
  let total=0;
  const cards=DIAGNOSTIC_DEFINITIONS.map((d,i)=>{const r=settled[i];if(r.status==='rejected')return `<div class="diagnostic-row has-issue"><div><strong>${esc(d.label)}</strong><div class="small">${esc(d.description)}</div><div class="notice">⚠️ この診断を実行できませんでした</div></div><span>--</span></div>`;const count=Number(r.value?.c||0);total+=count;return `<div class="diagnostic-row ${count?'has-issue':'is-ok'}"><div><strong>${esc(d.label)}</strong><div class="small">${esc(d.description)}</div>${count?`<a class="btn gray small" href="/api/settings/diagnostics-detail?issue=${encodeURIComponent(d.key)}">詳細を見る</a>`:''}</div><span class="diagnostic-count">${count}</span></div>`}).join('');
  return html(layout('データ診断',`<div class="page-head"><h1>🩺 データ診断</h1><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card"><div class="section-head"><h2>整合性（初期ロード ${DIAGNOSTIC_DEFINITIONS.length} query）</h2><span>${total?`要確認 ${total}件`:'異常なし'}</span></div><p class="small">詳細は押した時だけ最大20件を取得します。secret、token、Web Push endpoint/鍵は表示しません。</p>${cards}</div>${environmentAuditHtml(ctx.env)}`, '/app/settings.php'));
}

const apiAuthRequired=()=>json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
const apiBadRequest=(message:string)=>json({ok:false,error:message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
const apiForbidden=(message:string)=>json({ok:false,error:message||'この操作は許可されていません。',code:'FORBIDDEN'},403);

export async function settingsDiagnosticsDetail(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return apiAuthRequired();
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者権限が必要です。'},403);
  const issue=new URL(request.url).searchParams.get('issue')||'';
  const d=DIAGNOSTIC_DEFINITIONS.find(x=>x.key===issue);
  if(!d)return json({ok:false,error:'診断キーが不正です。'},400);
  if(issue==='task_range'){
    if(request.method==='POST'){
      let b:Record<string,unknown>;
      try{b=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return apiBadRequest(error.message);throw error;}
      if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
      if(typeof b.csrf!=='string'||b.csrf!==ctx.session.csrfToken)return apiForbidden('CSRF検証に失敗しました。');
      if(String(b.action||'')!=='repair_unambiguous_task_ranges')return json({ok:false,error:'修復操作が不正です。'},400);
      const now=nowJst();
      const repaired=await ctx.env.DB.prepare("UPDATE tasks SET end_at=start_at,updated_at=? WHERE family_id=? AND all_day=1 AND start_at IS NOT NULL AND end_at IS NOT NULL AND datetime(start_at) IS NOT NULL AND datetime(end_at) IS NOT NULL AND date(substr(start_at,1,10), '+0 days')=substr(start_at,1,10) AND date(substr(end_at,1,10), '+0 days')=substr(end_at,1,10) AND datetime(end_at)<datetime(start_at) AND substr(start_at,1,10)=substr(end_at,1,10)").bind(now,m.family_id).run();
      return json({ok:true,issue,repaired_count:Number(repaired.meta.changes||0)});
    }
    if(request.method!=='GET')return json({ok:false,error:'GET/POST only'},405);
    const counts=await ctx.env.DB.prepare("SELECT COUNT(*) c,SUM(CASE WHEN all_day=1 AND datetime(start_at) IS NOT NULL AND datetime(end_at) IS NOT NULL AND date(substr(start_at,1,10), '+0 days')=substr(start_at,1,10) AND date(substr(end_at,1,10), '+0 days')=substr(end_at,1,10) AND datetime(end_at)<datetime(start_at) AND substr(start_at,1,10)=substr(end_at,1,10) THEN 1 ELSE 0 END) repairable FROM tasks WHERE family_id=? AND start_at IS NOT NULL AND (datetime(start_at) IS NULL OR date(substr(start_at,1,10), '+0 days') IS NULL OR date(substr(start_at,1,10), '+0 days')<>substr(start_at,1,10) OR (end_at IS NOT NULL AND (datetime(end_at) IS NULL OR date(substr(end_at,1,10), '+0 days') IS NULL OR date(substr(end_at,1,10), '+0 days')<>substr(end_at,1,10) OR datetime(end_at)<datetime(start_at))))").bind(m.family_id).first<Row>();
    return json({ok:true,issue,count:Number(counts?.c||0),repairable_count:Number(counts?.repairable||0)});
  }
  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);
  const rows=await ctx.env.DB.prepare(`SELECT id FROM tasks WHERE family_id=? AND id IN (SELECT task_id FROM external_calendar_links WHERE family_id=?) LIMIT 20`).bind(m.family_id,m.family_id).all<Row>();
  return json({ok:true,issue,items:rows.results.map(x=>({id:Number(x.id)})),limited:20});
}
