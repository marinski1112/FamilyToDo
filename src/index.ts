import { json, redirect, html } from './response';
import { makeContext, layout, liffLogin, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, taskEvents, calendar, messages, shopping, toggle, home, loginPage, createFamilyPage, apiMe, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, settingsDiagnostics, settingsDiagnosticsDetail, familyLog, recordOccurrenceFamilyLog, webPushApi, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired, BadRequest, Forbidden, taskVisibilitySql, taskChildVisibilitySql } from './app';
import { openSession, getSessionCookie } from './session';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { sendWebPush, webPushConfigured } from './webpush';
import { familyLogImportApi, familyLogImportPage } from './family-log-import';
import { googleAuthorize, googleFulfillment, googleHomeHealth, googleHomeSettings, googleToken } from './google-home';
import { familyAiQuery, familyAiPlan, familyAiExecute, familyAiConnectionTest, familyAiModelProbe, familyAiModelCatalog, familyAiModelCompatibility, familyAiModelSelect, familyAiModelReset } from './family-ai';
import { googleTasksAuthorize, googleTasksCallback, googleTasksSettings, googleTasksAction, processGoogleTasksInbound } from './google-tasks';
import { googleCalendarAuthorize, googleCalendarCallback, integrationsSettings, queueCalendarProjectionAfterMutation, processCalendarOutbox, processCalendarInbound, calendarSyncNow, calendarDisconnect, calendarRetryFailed, calendarBackfill, calendarWatchWebhook, renewCalendarWatches, wakeCalendarOutbox } from './google-calendar';
import { DEFAULT_FAMILY_TIMEZONE, familyDate, formatStoredUtcForFamily, utcNow } from './timezone';
import { integrationsHealthResponse } from './environment-health';
import { preserveGoogleHomeLogin, liffDispatcher, resumeGoogleHome, lineGoogleHomeStart, lineGoogleHomeCallback } from './oauth-continuation';
import { validateLiffNext } from './liff-target';
import { calendarImportPage, calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';
import { logNotificationFailure, logRequestFailure } from './observability/errors';
import { childJournalApi, childJournalPage } from './child-journal';
import { processChildJournalCalendarOutbox } from './child-journal-calendar';
import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';
import { logsPage } from './activity-log-page';
import { cleanupNotificationLifecycle } from './notification-lifecycle';
import { processLineDailyDigests } from './line-daily-digest';
import { webhook } from './line-webhook';
import { itemApi } from './item-api';
import { taskApi } from './task-api';
import { convertOccurrence } from './recurring-occurrence';
import { dispatchPageRoute } from './page-routes';
import { dispatchContextApiRoute } from './context-api-routes';
import { dispatchPublicRoute } from './public-routes';
import { reorderApi } from './reorder-api';

const text = (r: Response) => r;
const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      const publicResponse=await dispatchPublicRoute(request,env,ctx,url);
      if(publicResponse) return publicResponse;
      // 認証が必要なページは、例外ベースのリダイレクトに依存せず
      // ルーティング直下で未ログインを処理する。Cloudflare Runtimeでの
      // 例外化/Response処理の差異による1101を避けるため。
      if(url.pathname==='/app/recurring.php') {
        if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));
        const context=await makeContext(request,env,ctx);
        if(!context.member){const next=validateLiffNext(url.pathname+url.search);return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');}
        return await recurring(request,context);
      }
      const context=await makeContext(request,env,ctx);
      if(url.pathname==='/oauth/google/authorize') {
        console.log(JSON.stringify({stage:'AUTHORIZE_RECEIVED',provider:'GOOGLE_HOME'}));
        return await preserveGoogleHomeLogin(request,env,await googleAuthorize(request,context));
      }
      if(url.pathname==='/oauth/google-tasks/authorize') return await googleTasksAuthorize(request,context);
      if(url.pathname==='/oauth/google-calendar/authorize') return await googleCalendarAuthorize(request,context);
      if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);
      const apiResponse=await dispatchContextApiRoute(request,context,url);
      if(apiResponse) return apiResponse;
      const pageResponse=await dispatchPageRoute(request,context,env,url);
      if(pageResponse) return pageResponse;
      if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);
      if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);
      if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);
      if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);
      if(url.pathname==='/logout.php'||url.pathname==='/logout') return await logout(request,env);
      if(url.pathname==='/task/delete.php') return await taskDelete(request,context);
      if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);
      if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');
      if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));
      return await env.ASSETS.fetch(request);
    }catch(e:any){
      if(e instanceof AuthRequired){if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/app/api/'))return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);const next=validateLiffNext(url.pathname+url.search);return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');}
      if(e instanceof BadRequest) return json({ok:false,error:e.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
      if(e instanceof Forbidden) return json({ok:false,error:e.message||'この操作は許可されていません。',code:'FORBIDDEN'},403);
      const {message,requestId}=logRequestFailure(e,request,url);
      if(/no such (table|column)|has no column named|no column named/i.test(message)) {
        return json({ok:false,error:'D1のデータベース構成または制約がWorkerの最新版と一致していません。/ __cf/db-schema-health と /__cf/db-runtime-health を確認してください。',code:'DB_SCHEMA_MIGRATION_REQUIRED',path:url.pathname,request_id:requestId},503);
      }
      if(url.pathname.startsWith('/api/calendar-import/')) return json({ok:false,error:'カレンダーの確認処理に失敗しました。',code:'CALENDAR_IMPORT_INTERNAL_ERROR',request_id:requestId},500);
      return json({ok:false,error:'内部エラーです。',code:'INTERNAL_ERROR',path:url.pathname,request_id:requestId},500);
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext){
    console.log(`[Family TODO LINE] scheduled ${controller.cron}`);
    if(controller.cron==='3,8,13,18,23,28,33,38,43,48,53,58 * * * *'){
      ctx.waitUntil(processGoogleTasksInbound(env));
      return;
    }
    if(controller.cron==='*/5 * * * *'){
      ctx.waitUntil(processNotifications(env));
      ctx.waitUntil(processLineDailyDigests(env));
      ctx.waitUntil(processCalendarOutbox(env));
      ctx.waitUntil(processChildJournalCalendarOutbox(env));
    }
    if(controller.cron==='7,37 * * * *'){ctx.waitUntil(processCalendarInbound(env));ctx.waitUntil(renewCalendarWatches(env));}
  }
} satisfies ExportedHandler<Env>;






async function taskNew(ctx: any,date:string,returnTo:string=''): Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/task/new.php?date='+date));
  const [members,categories]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare(`SELECT DISTINCT s.category FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} AND s.category IS NOT NULL AND s.category<>'' ORDER BY s.category`).bind(ctx.member.family_id,ctx.member.id).all()
  ]);
  const body=`<div class="card form-card"><h1>📝 タスク・イベント追加</h1><form id="taskForm" class="compact-form" autocomplete="off"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>タイトル</label><input name="title" required maxlength="255" autofocus><label class="checkrow"><input id="isEvent" type="checkbox" name="is_event"><span>イベントとして登録（誕生日・有給など）</span></label><p class="small event-help">イベントはチェックボックスと期限切れ判定の対象外です。日付・通知・場所・カレンダー色などは通常タスクと同じです。</p><label>説明</label><textarea name="description" maxlength="5000"></textarea><label class="checkrow private-task-option"><input id="isPrivate" type="checkbox" name="is_private"><span>🔒 自分専用</span></label><p class="small private-task-help">他の家族にはタスク・カレンダー・詳細を表示しません</p><label>日付</label><div class="date-option-row date-range-grid task-date-row"><div><span class="small">開始日</span><input id="taskDate" type="date" name="dateOnly" value="${date}"></div><div id="endDateWrap"><span class="small">終了日</span><input id="taskEndDate" type="date" name="endDateOnly" value="${date}"></div><label class="checkrow"><input id="noDate" type="checkbox" name="noDate"><span>期限なし（未整理）</span></label></div><label class="checkrow"><input id="allDay" type="checkbox" name="allDay" checked><span>終日</span></label><div id="dateTimes" class="task-time-fields" style="display:none"><div class="field-block"><label>開始時刻</label><input type="time" name="startTime"></div><div class="field-block"><label>終了時刻</label><input type="time" name="endTime"></div></div><label>場所</label><input name="location"><label>カレンダー表示</label><label class="checkrow"><input id="taskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label><div id="taskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div><div id="taskCompletionWrap"><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select></div><label>担当者</label><div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}</div><label>通知日時（任意）</label><input type="datetime-local" name="reminderAt"><p class="small">指定すると担当者へタスク詳細を設定した通知方法で通知します。通知設定はON/OFFのみです。</p><div class="sub-card"><button type="button" class="section-button" id="shoppingToggle">＋ このタスクに買い物を追加</button><div id="shoppingBox" style="display:none"><label>カテゴリー</label><select name="shopping_category"><option value="">カテゴリーなし</option>${categories.results.map((c:any)=>`<option value="${String(c.category).replace(/[&<>\"]/g,'')}">${String(c.category).replace(/[&<>\"]/g,'')}</option>`).join('')}<option value="__custom__">自由入力</option></select><input id="shoppingCustom" name="shopping_category_custom" placeholder="新しいカテゴリー" style="display:none"><div id="shoppingRows"><div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input type="text" name="shopping_quantity[]" value="1" inputmode="numeric" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div></div><button type="button" class="btn gray small" id="addShoppingRow">＋ 商品を追加</button></div></div><div class="sub-card"><button type="button" class="section-button" id="itemsToggle">＋ このタスクに持ち物を追加</button><div id="itemsBox" style="display:none"><div id="itemRows"><div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div></div><button type="button" class="btn gray small" id="addItemRow">＋ 持ち物を追加</button></div></div><button>登録する</button></form></div><script type="application/json" id="taskNewPayload">${JSON.stringify({returnTo}).replaceAll('<','\u003c').replaceAll('>','\u003e').replaceAll('&','\u0026')}</script><script src="/assets/task-new.js?v=12.144.0-wave125"></script>`;
  return new Response(layout('タスク・イベント追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})
}
async function itemNew(ctx:any,date:string,selectedTaskId=0):Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date));
  const [members,tasks]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare(`SELECT id,title,start_at,due_at,visibility_scope FROM tasks t WHERE family_id=? AND status<>'completed' AND (visibility_scope='FAMILY' OR (id=? AND ${taskVisibilitySql('t')})) ORDER BY coalesce(start_at,due_at),id LIMIT 200`).bind(ctx.member.family_id,selectedTaskId,ctx.member.id).all()
  ]);
  const selectedTask=tasks.results.find((t:any)=>Number(t.id)===selectedTaskId),privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE';
  const body=`<div class="card form-card"><h1>🎒 持ち物追加</h1><div id="itemFormError" class="error" style="display:none"></div><form id="itemForm"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>持ち物名</label><input name="name" maxlength="255" required autofocus><label>関連タスク</label>${privateContext?`<p class="notice">🔒 自分専用タスク: ${String(selectedTask.title).replace(/[&<>"]/g,'')}</p><input type="hidden" name="task_id" value="${selectedTaskId}">`:`<select name="task_id"><option value="0">タスクなし</option>${tasks.results.map((t:any)=>`<option value="${t.id}" ${Number(t.id)===selectedTaskId?'selected':''}>${String(t.title).replace(/[&<>"]/g,'')}</option>`).join('')}</select>`}<label>日付（タスクを指定しない場合）</label><input type="date" name="date" value="${date}"><label>メモ</label><textarea name="memo" maxlength="5000"></textarea><label>担当者</label>${privateContext?'<p class="notice">🔒 自分専用タスクのため、担当者はあなたのみです</p>':`<div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>"]/g,'')}</label>`).join('')}</div>`}<button type="submit">登録する</button></form></div><script src="/assets/item-new.js?v=12.93-wave74"></script>`;
  return new Response(layout('持ち物追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})
}









async function processNotifications(env: Env): Promise<void> {
  await cleanupNotificationLifecycle(env);
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id,COALESCE(m.notification_channel,'LINE') notification_channel FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status IN ('pending','retry') AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all();
  for(const n of due.results) {
    try {
      const channel='WEB_PUSH'; // Wave128: normal notifications never consume LINE quota.
      {
        if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');
        const subs=await env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE member_id=? AND enabled=1 ORDER BY id DESC LIMIT 10').bind(Number(n.member_id)).all();
        if(!subs.results.length)throw new Error('Web Push subscription is not registered.');
        let sent=0;
        for(const sub of subs.results){
          const result=await sendWebPush(env,{id:Number(sub.id),endpoint:String(sub.endpoint),p256dh:String(sub.p256dh),auth:String(sub.auth)},{title:'Family TODO LINE',body:String(n.message||'Family TODO LINEからのお知らせです。'),url:n.target_type==='message'?'/app/messages.php':'/app/tasks.php',tag:`familytodo-${String(n.target_type||'notice')}-${String(n.target_id||n.id)}`});
          if(result.ok){sent++;await env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?,last_error=NULL,failure_count=0,updated_at=? WHERE id=?').bind(nowJst(),nowJst(),Number(sub.id)).run();}
          else if(result.gone){await env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(Number(sub.id)).run();}
          else{await env.DB.prepare('UPDATE web_push_subscriptions SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE id=?').bind(String(result.error||`HTTP ${result.status}`).slice(0,500),nowJst(),Number(sub.id)).run();}
        }
        if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');
      }
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=?,updated_at=? WHERE id=?').bind('sent',nowJst(),nowJst(),n.id).run();
    } catch(e) {
      const current=await env.DB.prepare('SELECT COALESCE(attempt_count,0) attempt_count FROM notifications WHERE id=?').bind(n.id).first();
      const attempts=Number(current?.attempt_count||0)+1;
      const status=attempts>=5?'error':'retry';
      await env.DB.prepare('UPDATE notifications SET status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?').bind(status,attempts,String(e instanceof Error?e.message:e).slice(0,1000),nowJst(),n.id).run().catch(()=>{});
      logNotificationFailure(e);
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
  const task=await ctx.env.DB.prepare('SELECT created_by,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first();
  if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
  const exceptionOrigin=await ctx.env.DB.prepare('SELECT o.id,o.recurrence_rule_id,o.occurrence_date FROM recurrence_occurrences o WHERE o.exception_task_id=? AND o.family_id=? LIMIT 1').bind(id,m.family_id).first();
  const exceptionMode=String(new URL(request.url).searchParams.get('exception_mode')||'');
  if(exceptionOrigin&&!['restore','exclude'].includes(exceptionMode))return json({ok:false,error:'このタスクは定期タスクの例外です。削除後の扱いを選択してください。'},400);
  let restoredStatus='pending',restoredBy:null|number=null,restoredAt:null|string=null;
  if(exceptionOrigin&&exceptionMode==='restore'){
    const rr=await ctx.env.DB.prepare('SELECT r.task_id,t.completion_mode FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.id=? AND r.family_id=? LIMIT 1').bind(Number(exceptionOrigin.recurrence_rule_id),m.family_id).first();
    const assigned=Number((await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rr?.task_id||0)).first())?.c||0);
    const completed=Number((await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=? AND ta.task_id=?').bind(Number(exceptionOrigin.id),Number(rr?.task_id||0)).first())?.c||0);
    const last=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at DESC LIMIT 1').bind(Number(exceptionOrigin.id)).first();
    const mode=String(rr?.completion_mode||'ANY').toUpperCase();
    const complete=assigned>0&&(mode==='ALL'?completed>=assigned:completed>0);
    if(complete){restoredStatus='completed';restoredBy=Number(last?.member_id||0)||null;restoredAt=String(last?.completed_at||'')||null;}
  }
  const childShopping=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const childItems=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const recurrenceRules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const statements:any[]=[];
  const deleteNow=nowJst();
  statements.push(ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(deleteNow,id,m.family_id));
  if(exceptionOrigin&&exceptionMode==='exclude'){
    statements.push(
      ...archiveRecurrenceOccurrenceCompletionStatements(ctx.env.DB,m.family_id,Number(exceptionOrigin.id),deleteNow,'recurrence_occurrence_excluded'),
      ctx.env.DB.prepare("UPDATE recurrence_occurrences SET exception_task_id=NULL,status='excluded',completed_by=NULL,completed_at=NULL,updated_at=? WHERE id=? AND family_id=?").bind(deleteNow,Number(exceptionOrigin.id),m.family_id)
    );
  }else if(exceptionOrigin&&exceptionMode==='restore'){
    statements.push(ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=NULL,status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(restoredStatus,restoredBy,restoredAt,deleteNow,Number(exceptionOrigin.id),m.family_id));
  }
  for(const r of recurrenceRules.results){
    statements.push(
      ...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,Number(r.id),deleteNow),
      ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
    );
  }
  for(const r of childShopping.results){const sid=Number(r.id);statements.push(
    ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(sid),
    ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,sid,deleteNow),
    ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(sid,m.family_id)
  );}
  for(const r of childItems.results){const iid=Number(r.id);statements.push(
    ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(iid),
    ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,iid,deleteNow),
    ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(iid,m.family_id)
  );}
  statements.push(
    ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
    ...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,deleteNow),
    ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
  );
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  await ctx.env.DB.batch(statements);
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  return json({ok:true,redirect:'/app/tasks.php'});
}
