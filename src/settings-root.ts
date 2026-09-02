import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { logActivity } from './activity-log';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { commitSession } from './session';
import { DEFAULT_FAMILY_TIMEZONE, FAMILY_TIMEZONE_OPTIONS, validateTimezone } from './timezone';
import { validateLiffNext } from './liff-target';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

function authRequiredResponse(ctx:AppContext):Response{
  const url=new URL(ctx.request.url);
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/app/api/'))return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  const next=validateLiffNext(url.pathname+url.search);
  return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');
}

async function requireBody(request:Request):Promise<Record<string,unknown>|Response>{
  try{return await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return json({ok:false,error:error.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
    throw error;
  }
}

function csrfResponse(ctx:AppContext,token:unknown):Response|null{
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  return null;
}

/** Canonical top-level settings page/API handler independent from the legacy app.ts monolith. */
export async function settings(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  const role=String(m.role||'').toUpperCase();
  const isAdmin=role==='OWNER'||role==='ADMIN';
  if(request.method==='POST'){
    const parsed=await requireBody(request);
    if(parsed instanceof Response)return parsed;
    const b=parsed;
    const csrfFailure=csrfResponse(ctx,b.csrf);
    if(csrfFailure)return csrfFailure;
    const action=String(b.action||'');
    if(action==='family_timezone'){
      if(!isAdmin)return json({ok:false,error:'管理者権限が必要です。'},403);
      const timezone=String(b.timezone||'');
      if(!validateTimezone(timezone)||!FAMILY_TIMEZONE_OPTIONS.includes(timezone as any))return json({ok:false,error:'タイムゾーンが不正です。'},400);
      await ctx.env.DB.prepare('UPDATE families SET timezone=?,updated_at=? WHERE id=?').bind(timezone,nowJst(),m.family_id).run();
      await logActivity(ctx,'UPDATED','family',m.family_id,{setting:'timezone',timezone});
      return json({ok:true});
    }
    if(action==='member_permission'){
      if(!isAdmin)return json({ok:false,error:'管理者権限が必要です。'},403);
      const target=Number(b.member_id||0),granted=Boolean(b.granted);
      const targetMember=await ctx.env.DB.prepare('SELECT id,role FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(target,m.family_id).first<Row>();
      if(!targetMember)return json({ok:false,error:'メンバーが見つかりません。'},404);
      if(granted)await ctx.env.DB.prepare("INSERT OR IGNORE INTO member_permissions(family_id,member_id,permission_key,granted_by,created_at) VALUES(?,?,'MANAGE_QUICK_CHORES',?,?)").bind(m.family_id,target,m.id,nowJst()).run();
      else await ctx.env.DB.prepare("DELETE FROM member_permissions WHERE family_id=? AND member_id=? AND permission_key='MANAGE_QUICK_CHORES'").bind(m.family_id,target).run();
      await logActivity(ctx,granted?'PERMISSION_GRANTED':'PERMISSION_REVOKED','member',target,{permission_key:'MANAGE_QUICK_CHORES'});
      return json({ok:true});
    }
    if(action==='profile'){
      const name=String(b.name||'').trim();
      if(!name)return json({ok:false,error:'名前を入力してください。',code:'BAD_REQUEST'},400);
      await ctx.env.DB.prepare('UPDATE members SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(name,nowJst(),m.id,m.family_id).run();
      ctx.member={...m,name};
      return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
    }
    if(action==='member_toggle'||action==='member_delete'){
      if(!isAdmin)return json({ok:false,error:'管理者権限が必要です。'},403);
      const target=Number(b.member_id||0);
      if(target===m.id||!target)return json({ok:false,error:'対象が不正です。'},400);
      const targetMember=await ctx.env.DB.prepare('SELECT id,role,active,deleted_at FROM members WHERE id=? AND family_id=?').bind(target,m.family_id).first<Row>();
      if(!targetMember)return json({ok:false,error:'メンバーが見つかりません。'},404);
      if(String(targetMember.role).toUpperCase()==='OWNER')return json({ok:false,error:'OWNERは変更できません。'},400);
      if(action==='member_toggle'){
        if(targetMember.deleted_at)return json({ok:false,error:'削除済みメンバーは再開できません。'},400);
        const nextActive=Number(targetMember.active)?0:1;
        const now=nowJst();
        await ctx.env.DB.prepare('UPDATE members SET active=?,updated_at=? WHERE id=? AND family_id=?').bind(nextActive,now,target,m.family_id).run();
        if(!nextActive){
          await ctx.env.DB.batch([
            ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE member_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM task_assignees WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM item_assignees WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM task_completions WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM item_completions WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
            ctx.env.DB.prepare("UPDATE tasks SET status=CASE WHEN completion_mode='ALL' THEN CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id)>0 AND (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id)>= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=tasks.id) THEN 'completed' ELSE 'pending' END ELSE CASE WHEN (SELECT COUNT(*) FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=tasks.id)>0 THEN 'completed' ELSE 'pending' END END, completed_by=NULL, completed_at=NULL, updated_at=? WHERE family_id=?").bind(now,m.family_id),
            ctx.env.DB.prepare("UPDATE items SET status=CASE WHEN completion_mode='ALL' THEN CASE WHEN (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id)>0 AND (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>= (SELECT COUNT(*) FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=items.id) THEN 'completed' ELSE 'pending' END ELSE CASE WHEN (SELECT COUNT(*) FROM item_completions ic JOIN item_assignees ia ON ia.item_id=ic.item_id AND ia.member_id=ic.member_id JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ic.item_id=items.id)>0 THEN 'completed' ELSE 'pending' END END, completed_by=NULL, completed_at=NULL, updated_at=? WHERE family_id=?").bind(now,m.family_id),
          ]);
        }
        await logActivity(ctx,nextActive?'MEMBER_REACTIVATED':'MEMBER_DEACTIVATED','member',target);
        return json({ok:true});
      }
      if(targetMember.deleted_at)return json({ok:false,error:'すでに削除済みです。'},400);
      const now=nowJst();
      await ctx.env.DB.batch([
        ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE member_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_assignees WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_completions WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_completions WHERE member_id=? AND item_id IN (SELECT id FROM items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_completions WHERE member_id=? AND shopping_item_id IN (SELECT id FROM shopping_items WHERE family_id=?)').bind(target,m.family_id),
        ctx.env.DB.prepare('UPDATE members SET active=0,notification_enabled=0,deleted_at=?,updated_at=? WHERE id=? AND family_id=?').bind(now,now,target,m.family_id),
      ]);
      await logActivity(ctx,'MEMBER_DELETED','member',target);
      return json({ok:true});
    }
    if(action==='notification'){
      const enabled=b.enabled?1:0;
      await ctx.env.DB.prepare('UPDATE members SET notification_enabled=?,updated_at=? WHERE id=? AND family_id=?').bind(enabled,nowJst(),m.id,m.family_id).run();
      return json({ok:true});
    }
  }
  const family=await ctx.env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(m.family_id).first<Row>();
  const members=await ctx.env.DB.prepare('SELECT id,name,role,active,notification_enabled FROM members WHERE family_id=? AND deleted_at IS NULL ORDER BY id').bind(m.family_id).all<Row>();
  await ctx.env.DB.prepare('SELECT * FROM notification_settings WHERE family_id=? AND member_id=?').bind(m.family_id,m.id).first<Row>();
  await ctx.env.DB.prepare('SELECT id,name AS title,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active FROM recurrence_rules WHERE family_id=? ORDER BY active DESC,id DESC').bind(m.family_id).all<Row>();
  const body=`<div class="card"><h1>⚙️ 管理</h1><h2>プロフィール</h2><form id="profile"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input name="name" value="${esc(m.name)}" required><button>保存</button></form></div>${isAdmin?`<div class="card"><h2>家族設定</h2><form id="familyTimezone"><label>タイムゾーン</label><select name="timezone">${FAMILY_TIMEZONE_OPTIONS.map(z=>`<option value="${z}" ${String(family?.timezone||DEFAULT_FAMILY_TIMEZONE)===z?'selected':''}>${z==='Asia/Tokyo'?'日本 / ':''}${z}</option>`).join('')}</select><p class="small">タイムゾーンを変更しても、既存の記録日時は自動変換されません。</p><button>保存する</button></form></div>`:''}<div class="card settings-links"><div class="section-link"><div><h2>🔗 外部連携</h2><p class="small">Google Home・Google Calendar・Family AIを分けて管理します。</p></div><a class="btn gray" href="/app/settings_integrations.php">開く</a></div><div class="section-link"><div><h2>👨‍👩‍👧 家族メンバー</h2><p class="small">家族メンバーと招待を管理します。</p></div><a class="btn" href="/app/settings_members.php">開く</a></div><div class="section-link"><div><h2>🐣 家族ログ管理</h2><p class="small">記録対象・表示項目・インポートを管理します。</p></div><a class="btn gray" href="/app/settings_family_log.php">開く</a></div><div class="section-link"><div><h2>📋 投稿管理</h2><p class="small">タスク・持ち物・買い物・伝言を確認します。</p></div><a class="btn gray" href="/app/settings_content.php">開く</a></div><div class="section-link"><div><h2>📅 カレンダーインポート</h2><p class="small">ICS / TimeTreeの予定を安全に確認して取り込みます。</p></div><a class="btn gray" href="/app/calendar_import.php">開く</a></div><div class="section-link"><div><h2>🔔 通知設定</h2><p class="small">LINE / Web Pushの通知方法と対象メンバーを設定します。</p></div><a class="btn gray" href="/app/settings_notifications.php">開く</a></div><div class="section-link"><div><h2>🩺 データ診断</h2><p class="small">通知・定期タスク・削除履歴・紐付けの整合性を確認します。</p></div><a class="btn gray" href="/app/settings_diagnostics.php">開く</a></div><div class="section-link"><div><h2>🔁 定期タスク</h2><p class="small">毎日・毎週・毎月などの繰り返しを設定します。</p></div><a class="btn gray" href="/app/recurring.php">開く</a></div><div class="section-link"><div><h2>📊 家族の活動ログ</h2><p class="small">タスク完了や家族ログの記録・編集を、誰がいつ行ったか確認します。</p></div><a class="btn gray" href="/app/logs.php">開く</a></div></div><script type="application/json" id="settingsPayload">${JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')}</script><script src="/assets/settings.js?v=12.147.0-wave128"></script>`;
  return html(layout('管理',body,'/app/settings.php'));
}
