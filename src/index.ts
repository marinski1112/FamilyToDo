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
import { DEFAULT_FAMILY_TIMEZONE, familyDate, formatStoredUtcForFamily } from './timezone';
import { integrationsHealthResponse } from './environment-health';
import { preserveGoogleHomeLogin, liffDispatcher, resumeGoogleHome, lineGoogleHomeStart, lineGoogleHomeCallback } from './oauth-continuation';
import { validateLiffNext } from './liff-target';
import { calendarImportPage, calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';
import { buildStoredTaskRange } from './task-range-safety';
import { logLineWebhookFailure, logNotificationFailure, logRequestFailure, logTaskCreationCleanupFailure } from './observability/errors';
import { childJournalApi, childJournalPage } from './child-journal';
import { processChildJournalCalendarOutbox } from './child-journal-calendar';
import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';
import { logsPage } from './activity-log-page';
import { cleanupNotificationLifecycle } from './notification-lifecycle';
import { processLineDailyDigests } from './line-daily-digest';

const text = (r: Response) => r;
const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
      if(url.pathname==='/__cf/secrets-health') return json({ok:true,service:'familytodo-secrets'});
      if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
      if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);
      if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);
      if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env,ctx);return await authHealth(context);}
      if(url.pathname==='/__cf/google-home-health') return await googleHomeHealth(env);
      if(url.pathname==='/__cf/integrations-health') return integrationsHealthResponse(env);
      if(url.pathname==='/api/google-calendar/watch') return await calendarWatchWebhook(request,env,ctx);
      if(url.pathname==='/oauth/google/token') return await googleToken(request,env);
      if(url.pathname==='/oauth/google-tasks/callback') return await googleTasksCallback(request,env);
      if(url.pathname==='/oauth/google-calendar/callback') return await googleCalendarCallback(request,env);
      if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);
      if(url.pathname==='/liff'||url.pathname.startsWith('/liff/')) return await liffDispatcher(request,env);
      if(url.pathname==='/oauth/line/google-home/start') return await lineGoogleHomeStart(request,env);
      if(url.pathname==='/oauth/line/google-home/callback') return await lineGoogleHomeCallback(request,env);
      if(url.pathname==='/oauth/google/continue') return await resumeGoogleHome(request,env);
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
      if(url.pathname==='/api/family/create') return await createFamily(request,context);
      if(url.pathname==='/api/family/join') return await joinFamily(request,context);
      if(url.pathname==='/api/family/invite') return await inviteCreate(request,context);
      if(url.pathname==='/api/me') return await apiMe(context);
      if(url.pathname==='/api/toggle') return await toggle(request,context);
      if(url.pathname==='/api/task') return await taskApi(request,context);
      if(url.pathname==='/api/item') return await itemApi(request,context);
      if(url.pathname==='/api/messages') return await messages(request,context);
      if(url.pathname==='/api/shopping') return await shopping(request,context);
      if(url.pathname==='/api/family-log') return await familyLog(request,context);
      if(url.pathname==='/api/child-journal') return await childJournalApi(request,context);
      if(url.pathname==='/api/family-ai/query') return await familyAiQuery(request,context);
      if(url.pathname==='/api/family-ai/plan') return await familyAiPlan(request,context);
      if(url.pathname==='/api/family-ai/execute') return await familyAiExecute(request,context);
      if(url.pathname==='/api/family-ai/connection-test') return await familyAiConnectionTest(request,context);
      if(url.pathname==='/api/family-ai/model-probe') return await familyAiModelProbe(request,context);
      if(url.pathname==='/api/family-ai/model-catalog') return await familyAiModelCatalog(request,context);
      if(url.pathname==='/api/family-ai/model-compatibility') return await familyAiModelCompatibility(request,context);
      if(url.pathname==='/api/family-ai/model-select') return await familyAiModelSelect(request,context);
      if(url.pathname==='/api/family-ai/model-reset') return await familyAiModelReset(request,context);
      if(url.pathname==='/api/settings/diagnostics-detail') return await settingsDiagnosticsDetail(request,context);
      if(url.pathname==='/api/google-tasks/action') return await googleTasksAction(request,context);
      if(url.pathname==='/api/google-calendar/sync') return await calendarSyncNow(request,context);
      if(url.pathname==='/api/google-calendar/backfill') return await calendarBackfill(request,context);
      if(url.pathname==='/api/google-calendar/disconnect') return await calendarDisconnect(request,context);
      if(url.pathname==='/api/google-calendar/retry-failed') return await calendarRetryFailed(request,context);
      if(url.pathname==='/api/family-log-import') return await familyLogImportApi(request,context);
      if(url.pathname==='/api/calendar-import/preview') return await calendarImportPreview(request,context);
      if(url.pathname==='/api/calendar-import/normalization-preview') return await calendarImportNormalizationPreview(request,context);
      if(url.pathname==='/api/calendar-import/prepare') return await calendarImportPrepare(request,context);
      if(url.pathname==='/api/calendar-import/status') return await calendarImportStatus(request,context);
      if(url.pathname==='/api/calendar-import/apply') return await calendarImportApply(request,context);
      if(url.pathname==='/api/calendar-import/rollback') return await calendarImportRollback(request,context);
      if(url.pathname==='/api/recurrence/family-log-complete') return await recordOccurrenceFamilyLog(request,context);
      if(url.pathname==='/api/settings') return await settings(request,context);
      if(url.pathname==='/api/push/subscribe'||url.pathname==='/api/push/unsubscribe'||url.pathname==='/api/push/test') return await webPushApi(request,context);
      if(url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php') return await loginPage(env,url.searchParams.get('next')||'/app/index.php');
      if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);
      if(url.pathname==='/app/create.php'||url.pathname==='/app/create') return await createFamilyPage(context);
      if(url.pathname==='/app/join.php'||url.pathname==='/app/join') return await (url.searchParams.get('token') ? invitePage(context,url.searchParams.get('token')||'') : createFamilyPage(context));
      if(url.pathname==='/family/create.php'||url.pathname==='/family/create') return await createFamilyPage(context);
      if(url.pathname==='/family/join.php'||url.pathname==='/family/join') return await invitePage(context,url.searchParams.get('token')||'');
      if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return await home(context);
      if(url.pathname==='/today.php') return await today(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/tomorrow.php') return await tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/app/tasks.php') return await taskEvents(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/app/calendar.php') return await calendar(request,context,url.searchParams.get('month')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)).slice(0,7));
      if(url.pathname==='/app/messages.php') return await messages(request,context);
      if(url.pathname==='/app/shopping.php') return await shopping(request,context);
      if(url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php') return await familyLog(request,context);
      if(url.pathname==='/app/child_journal.php') return await childJournalPage(request,context);
      if(url.pathname==='/app/family_log_import.php') return await familyLogImportPage(context);
      if(url.pathname==='/app/calendar_import.php') return await calendarImportPage(context);
      if(url.pathname==='/app/settings.php') return await settings(request,context);
      if(url.pathname==='/app/settings_google_tasks.php') return await googleTasksSettings(request,context);
      if(url.pathname==='/app/settings_google_home.php') return await googleHomeSettings(request,context);
      if(url.pathname==='/app/settings_integrations.php') return await integrationsSettings(request,context);
      if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);
      if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);
      if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);
      if(url.pathname==='/logout.php'||url.pathname==='/logout') return await logout(request,env);
      if(url.pathname==='/task/delete.php') return await taskDelete(request,context);
      if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);
      if(url.pathname==='/app/message_new.php') return await messageNew(context);
      if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/app/settings_content.php') return await settingsContent(context);
      if(url.pathname==='/app/settings_diagnostics.php') return await settingsDiagnostics(context);
      if(url.pathname==='/app/settings_members.php') return await settingsMembers(request,context);
      if(url.pathname==='/app/settings_notifications.php') return await settingsNotifications(request,context);
      if(url.pathname==='/app/settings_recurring.php') return await recurring(request,context);
      if(url.pathname==='/app/logs.php') return await logsPage(context);
      if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');
      if(url.pathname==='/task/view.php') return await taskView(context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/task/edit.php') return await taskEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/item/edit.php') return await itemEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/app/shopping_edit.php') return await shoppingEdit(request,context,Number(url.searchParams.get('id')||0));
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

async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=[...new Set(Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>0):[])];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  if(ids.length>100)return json({ok:false,error:'一度に並べ替えできる件数を超えています。'},400);
  const placeholders=ids.map(()=>'?').join(',');
  const valid=await ctx.env.DB.prepare(`SELECT id FROM tasks t WHERE family_id=? AND id IN (${placeholders}) AND ${taskVisibilitySql('t')}`).bind(m.family_id,...ids,m.id).all();
  if(valid.results.length!==ids.length)return json({ok:false,error:'家族外または削除済みのタスクが含まれています。'},400);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i*10,now,id,m.family_id)));
  return json({ok:true,ids});
}


function calendarVisibleFlag(b: Record<string, unknown>): number { return b.calendar_visible===false || String(b.calendar_visible)==='0' ? 0 : 1; }

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

async function taskApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='DELETE'){
    const id=Number(new URL(request.url).searchParams.get('id')||0);
    const csrf=request.headers.get('x-csrf')||'';
    if(!id||csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'削除情報が不正です。'},403);
    const task=await ctx.env.DB.prepare(`SELECT created_by FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')}`).bind(id,m.family_id,m.id).first();
    if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
    const role=String(m.role||'').toUpperCase();
    if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
    const now=nowJst();
    const shops=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const items=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const rules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const q:any[]=[
      ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id),
    ];
    for(const r of rules.results){
      q.push(
        ...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,Number(r.id),now),
        ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
      );
    }
    for(const r of shops.results){
      const sid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(sid),
        ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,sid,now),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(sid,m.family_id)
      );
    }
    for(const r of items.results){
      const iid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(iid),
        ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,iid,now),
        ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(iid,m.family_id)
      );
    }
    q.push(
      ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
      ...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,now),
      ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
    );
    await ctx.env.DB.batch(q);
    try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); wakeCalendarOutbox(ctx,m.family_id); } catch { /* deletion remains authoritative */ }
    return json({ok:true});
  }
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const title=String(b.title??'').trim();const date=String(b.dateOnly??'').trim();const isEvent=Boolean(b.is_event);const noDate=!isEvent&&(Boolean(b.noDate)||date==='');
  if(!title)return json({ok:false,error:'タイトルを入力してください。'},400);
  if(isEvent&&!date)return json({ok:false,error:'イベントには日付を指定してください。'},400);
  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();
  const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});
  if(!range.ok){
    const error=range.error==='START_DATE_INVALID'?'日付が不正です。':range.error==='END_DATE_INVALID'?'終了日が不正です。':range.error==='DATE_ORDER'?'終了日は開始日以降にしてください。':range.error==='START_TIME_REQUIRED'?'開始日時を指定してください。':range.error==='START_TIME_INVALID'?'開始日時が不正です。':range.error==='END_TIME_INVALID'?'終了日時が不正です。':'終了日時は開始日時以降にしてください。';
    return json({ok:false,error},400);
  }
  const start=range.startAt,end=range.endAt;
  const reminderRaw=String(b.reminderAt??'').trim();
  const reminderAt=reminderRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
  if(reminderRaw && !reminderAt)return json({ok:false,error:'通知日時が不正です。'},400);
  const shoppingPre=Array.isArray(b.shopping)?(b.shopping as any[]).slice(0,50):[];
  for(const v of shoppingPre){const u=String(v?.url||'').trim();if(u){try{const parsed=new URL(u);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{return json({ok:false,error:'買い物URLが不正です。'},400);}}}
  const now=nowJst();const isPrivate=(b.is_private===true||String(b.is_private)==='1'||String(b.visibility_scope)==='PRIVATE');const completionMode=isPrivate?'ANY':(String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY');
  const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
  const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
  const dueValue=noDate?null:(end||start||`${date} 00:00:00`);
  const ids=isPrivate?[m.id]:[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
  if(ids.length){
    const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
    const validIds=new Set(valid.results.map((x:any)=>Number(x.id)));
    if(ids.some(id=>!validIds.has(id))) return json({ok:false,error:'担当者に無効なメンバーが含まれています。'},400);
  }
  let id=0;
  try {
    const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(m.family_id,title,String(b.description??'')||null,dueValue,'pending',completionMode,m.id,now,now,start,end,String(b.location??'')||null,allDay?1:0,calendarVisibleFlag(b),calendarColor,isEvent?'EVENT':'TASK',0,reminderAt,isPrivate?'PRIVATE':'FAMILY',isPrivate?m.id:null).run();
    id=Number(r.meta.last_row_id);
    if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    const now2=nowJst();
    const shopping=shoppingPre;
    if(shopping.length){
      const category=String(b.shopping_category==='__custom__'?b.shopping_category_custom:b.shopping_category||'').trim()||null;
      if(category && b.shopping_category==='__custom__') await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_categories(family_id,name,created_at) VALUES(?,?,?)').bind(m.family_id,category,now2).run().catch(()=>{});
      const dueDate=noDate?null:date; const group=crypto.randomUUID().replaceAll('-','').slice(0,16);
      for(const v of shopping.slice(0,50)){const name=String(v?.name||'').trim();if(!name)continue;const qty=String(v?.quantity||'1').trim()||'1';const url=String(v?.url||'').trim();const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,null,dueDate,m.id,now2,now2,id,url||null).run(); const sid=Number(sr.meta.last_row_id); if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
    }
    const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):[];
    if(itemNames.length){const group=crypto.randomUUID().replaceAll('-','').slice(0,16);for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,null,date?`${date} 00:00:00`:null,m.id,now2,now2,id,group).run();const iid=Number(ir.meta.last_row_id);if(ids.length)await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}}
    if(reminderAt && ids.length){
      const recipients=await ctx.env.DB.prepare(`SELECT id,name FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
      if(recipients.results.length) await ctx.env.DB.batch(recipients.results.map((r:any)=>ctx.env.DB.prepare('INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'task_reminder','task',id,reminderAt,'pending',`【タスク】${title}\n${String(b.description??'').trim()||'詳細なし'}${start?'\n予定: '+start.slice(0,16):''}${end?' ～ '+end.slice(11,16):''}${String(b.location??'').trim()?'\n場所: '+String(b.location).trim():''}`,now)));
    }
  } catch(e){
    if(id){
      try { await ctx.env.DB.batch([
        ctx.env.DB.prepare("DELETE FROM notifications WHERE family_id=? AND target_type='task' AND target_id=?").bind(m.family_id,id),
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
        ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]); } catch(cleanup){ logTaskCreationCleanupFailure(cleanup); }
    }
    throw e;
  }

  try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); wakeCalendarOutbox(ctx,m.family_id); } catch { /* local task remains authoritative */ }
  if(!isPrivate)await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','task',id,JSON.stringify({title}),nowJst()).run().catch(()=>{});return json({ok:true,id},201);
}

async function itemApi(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const name=String(b.name??'').trim(); const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  const taskId=Number(b.task_id??0)||null; let dueDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
  let privateOwner=0;if(taskId){const t=await ctx.env.DB.prepare(`SELECT id,start_at,end_at,due_at,visibility_scope,private_owner_id FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first();if(!t)return json({ok:false,error:'関連タスクが見つかりません。'},400);dueDate=String(t.start_at||t.due_at||'').slice(0,10)||dueDate;privateOwner=String(t.visibility_scope)==='PRIVATE'?Number(t.private_owner_id):0;}
  const now=nowJst();const r=await ctx.env.DB.prepare(`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?)`).bind(m.family_id,name,String(b.memo??'').trim()||null,dueDate?`${dueDate} 00:00:00`:null,m.id,now,now,taskId).run();
  const id=Number(r.meta.last_row_id); const ids=privateOwner?[privateOwner]:Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
  if(ids.length) await ctx.env.DB.batch(ids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
  if(!privateOwner)await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','item',id,JSON.stringify({name}),nowJst()).run().catch(()=>{});return json({ok:true,id,date:dueDate},201);
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
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { logLineWebhookFailure('reply',e); }
      }
    }
  } catch(e) { logLineWebhookFailure('handle',e); }
  return new Response('OK',{status:200});
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

async function convertOccurrence(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const ct=request.headers.get('content-type')||'';
  let b:any={};
  if(ct.includes('application/json')) b=await request.json().catch(()=>({}));
  else {const fd=await request.formData().catch(()=>new FormData());const obj:any={};fd.forEach((v,k)=>{obj[k]=v});b=obj;}
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const occId=Number(b.occurrence_id||0);if(!occId)return json({ok:false,error:'発生日が不正です。'},400);
  const occ=await ctx.env.DB.prepare('SELECT o.*,r.task_id,r.name,r.recurrence_type,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.calendar_color,t.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id JOIN tasks t ON t.id=r.task_id WHERE o.id=? AND o.family_id=? LIMIT 1').bind(occId,m.family_id).first();
  if(!occ)return json({ok:false,error:'発生日が見つかりません。'},404);
  if(occ.exception_task_id){const taskId=Number(occ.exception_task_id);return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:`/task/view.php?id=${taskId}`}):redirect(`/task/view.php?id=${taskId}`);}
  const date=String(occ.occurrence_date);const base=String(occ.start_at||'');const st=base.slice(11,19);const et=String(occ.end_at||'').slice(11,19);const now=nowJst();
  const completeRows=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at').bind(occId).all();
  const status=completeRows.results.length&&String(occ.status||'').toLowerCase()==='completed'?'completed':'pending';
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(m.family_id,occ.title,occ.description||null,`${date} ${st||'00:00:00'}`,status,occ.completion_mode||'ANY',m.id,now,now,st?`${date} ${st}`:null,et?`${date} ${et}`:null,occ.location||null,Number(occ.all_day??1),Number(occ.calendar_visible??1),String(occ.calendar_color||'#7c3aed'),'OCCURRENCE',null).run();
  const taskId=Number(r.meta.last_row_id);

  // Preserve the series assignees and any already-recorded completion state.
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,ta.member_id FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(taskId,Number(occ.task_id)).run();
  if(completeRows.results.length){
    await ctx.env.DB.batch(completeRows.results.flatMap((c:any)=>[
      ctx.env.DB.prepare("INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at) VALUES(?,?,'completed',?)").bind(taskId,Number(c.member_id),String(c.completed_at)),
      ctx.env.DB.prepare("INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,'COMPLETED',?)").bind(taskId,Number(c.member_id),String(c.completed_at))
    ]));
    if(status==='completed'){
      const last=completeRows.results[completeRows.results.length-1] as any;
      await ctx.env.DB.prepare('UPDATE tasks SET completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(Number(last.member_id),String(last.completed_at),now,taskId,m.family_id).run();
    }
  }

  // A recurring template's linked shopping/items are shared by the series. Clone them
  // for the exception task so changing this one date does not detach the series template.
  const [shops,items]=await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all(),
    ctx.env.DB.prepare('SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all()
  ]);
  for(const sh of shops.results as any[]){
    const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)")
      .bind(m.family_id,String(sh.name||''),String(sh.quantity||'1'),sh.category||null,sh.memo||null,date,m.id,now,now,taskId,sh.url||null).run();
    const sid=Number(sr.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,sa.member_id FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=?').bind(sid,Number(sh.id)).run();
  }
  for(const it of items.results as any[]){
    const time=String(it.due_at||'').slice(11,19);const dueAt=`${date} ${time||'00:00:00'}`;
    const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind(m.family_id,String(it.name||''),it.memo||null,dueAt,String(it.completion_mode||'ANY'),m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();
    const iid=Number(ir.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,ia.member_id FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(iid,Number(it.id)).run();
  }

  await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,occId,m.family_id).run();
  const redirectTo=`/task/view.php?id=${taskId}`;
  return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:redirectTo}):redirect(redirectTo);
}
