import { json, redirect, html } from './response';
import { makeContext, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, taskEvents, calendar, messages, shopping, home, loginPage, createFamilyPage, apiMe, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, settingsDiagnostics, settingsDiagnosticsDetail, familyLog, recordOccurrenceFamilyLog, webPushApi, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired, BadRequest, Forbidden } from './app';
import { openSession, getSessionCookie } from './session';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { familyLogImportApi, familyLogImportPage } from './family-log-import';
import { googleFulfillment, googleHomeHealth, googleHomeSettings, googleToken } from './google-home';
import { familyAiQuery, familyAiPlan, familyAiExecute, familyAiConnectionTest, familyAiModelProbe, familyAiModelCatalog, familyAiModelCompatibility, familyAiModelSelect, familyAiModelReset } from './family-ai';
import { googleTasksCallback, googleTasksSettings, googleTasksAction, processGoogleTasksInbound } from './google-tasks';
import { googleCalendarCallback, integrationsSettings, queueCalendarProjectionAfterMutation, processCalendarOutbox, processCalendarInbound, calendarSyncNow, calendarDisconnect, calendarRetryFailed, calendarBackfill, calendarWatchWebhook, renewCalendarWatches, wakeCalendarOutbox } from './google-calendar';
import { formatStoredUtcForFamily, utcNow } from './timezone';
import { integrationsHealthResponse } from './environment-health';
import { liffDispatcher, resumeGoogleHome, lineGoogleHomeStart, lineGoogleHomeCallback } from './oauth-continuation';
import { validateLiffNext } from './liff-target';
import { calendarImportPage, calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';
import { logRequestFailure } from './observability/errors';
import { childJournalApi, childJournalPage } from './child-journal';
import { processChildJournalCalendarOutbox } from './child-journal-calendar';
import { dbSchemaHealth, dbRuntimeHealth } from './runtime-diagnostics';
import { logsPage } from './activity-log-page';
import { processNotifications } from './notification-delivery';
import { processLineDailyDigests } from './line-daily-digest';
import { itemApi } from './item-api';
import { taskApi } from './task-api';
import { dispatchPageRoute } from './page-routes';
import { dispatchContextApiRoute } from './context-api-routes';
import { dispatchPublicRoute } from './public-routes';
import { dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';

const text = (r: Response) => r;
const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');

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
      const preludeResponse=await dispatchContextPreludeRoute(request,context,env,url);
      if(preludeResponse) return preludeResponse;
      const apiResponse=await dispatchContextApiRoute(request,context,url);
      if(apiResponse) return apiResponse;
      const pageResponse=await dispatchPageRoute(request,context,env,url);
      if(pageResponse) return pageResponse;
      const fallbackResponse=await dispatchContextFallbackRoute(request,context,env,url);
      if(fallbackResponse) return fallbackResponse;
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
