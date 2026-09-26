import {consumePhotoTransferRequest,redeemPhotoTransfer} from './photo-transfer-api';
import {cleanupExpiredPhotoTransfers} from './photo-transfer-service';
import {drainDeletedMessagePhotosGlobal} from './message-photo-service';
import {drainFamilyLogMediaGlobal} from './family-log-media-api';
import {cleanupLocationArrivals} from './location-arrival-push';
import {archiveLocationHistory} from './location-history-archive';
import {generateFamilyDailyJournals,repairFamilyDailyJournal,repairRecentFamilyDailyJournals} from './family-daily-journal';
import {generateFamilyDailyJournalAi} from './family-daily-journal-ai';
import { json, redirect } from './response';
import { cleanupFamilyLogDiagnostics } from './family-log-diagnostics';
import { cleanupCompletedTaskCreateRequests } from './task-create-idempotency';
import { AuthRequired, BadRequest, Forbidden } from './errors';
import { makeContext } from './app-context';
import { processGoogleTasksInbound } from './google-tasks';
import { processCalendarOutbox, renewCalendarWatches } from './google-calendar';
import { processGoogleCalendarInboundAuto } from './google-calendar-inbound-auto';
import { validateLiffNext } from './liff-target';
import { logRequestFailure } from './observability/errors';
import { processChildJournalCalendarOutbox } from './child-journal-calendar';
import { processNotifications } from './notification-delivery';
import { cleanupNotificationLifecycle, auditNotificationLifecycle } from './notification-lifecycle';
import { processLineDailyDigests } from './line-daily-digest';
import { processLinePeriodicDigests } from './line-periodic-digest';
import { dispatchPageRoute } from './page-routes';
import { dispatchContextApiRoute } from './context-api-routes';
import { dispatchPublicRoute } from './public-routes';
import { dispatchEarlyAuthenticatedRoute, dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';
import { cleanupCompletedGoods } from './checklist-completion';
import { scheduledDispatchPlanAt } from './scheduled-dispatch';
import {trackScheduledD1Reads,cleanupScheduledD1ReadDiagnostics} from './d1-read-diagnostics';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/api/photo-transfer/redeem')return redeemPhotoTransfer(request,env);
      if(url.pathname==='/api/photo-transfer/consume')return consumePhotoTransferRequest(request,env);
      const publicResponse=await dispatchPublicRoute(request,env,ctx,url);
      if(publicResponse) return publicResponse;
      const earlyAuthenticatedResponse=await dispatchEarlyAuthenticatedRoute(request,env,ctx,url);
      if(earlyAuthenticatedResponse) return earlyAuthenticatedResponse;
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
    const plan=scheduledDispatchPlanAt(controller.scheduledTime);
    console.log(`[Family TODO LINE] scheduled ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`);
    const run=(job:string,work:(observed:Env)=>Promise<unknown>)=>{
      const tracked=trackScheduledD1Reads(env,job);
      ctx.waitUntil(Promise.resolve().then(()=>work(tracked.env)).finally(()=>tracked.flush()));
    };

    if(plan.googleTasksInbound) run('google_tasks_inbound',processGoogleTasksInbound);

    if(plan.fiveMinuteCore){
      run('completed_goods',observed=>cleanupCompletedGoods(observed.DB,controller.scheduledTime));
      run('notifications',processNotifications);
      run('line_daily_digest',processLineDailyDigests);
      run('line_periodic_digest',processLinePeriodicDigests);
      run('calendar_outbox',processCalendarOutbox);
      run('calendar_inbound',processGoogleCalendarInboundAuto);
      run('child_journal_outbox',processChildJournalCalendarOutbox);
    }

    if(plan.hourlyCleanup){
      run('photo_transfer_cleanup',observed=>cleanupExpiredPhotoTransfers(observed.DB));
      run('message_photo_cleanup',observed=>drainDeletedMessagePhotosGlobal(observed.DB,observed.MEDIA));
      run('family_log_media_cleanup',drainFamilyLogMediaGlobal);
      run('notification_lifecycle',cleanupNotificationLifecycle);
      run('family_log_diagnostics',cleanupFamilyLogDiagnostics);
      run('task_claim_cleanup',observed=>cleanupCompletedTaskCreateRequests(observed.DB));
      run('location_arrivals',observed=>cleanupLocationArrivals(observed).catch(()=>{}));
      run('location_archive_journal',observed=>archiveLocationHistory(observed).then(async archived=>{
        await generateFamilyDailyJournals(observed);
        for(const group of archived)await repairFamilyDailyJournal(observed.DB,group.family_id,group.local_date);
        await repairRecentFamilyDailyJournals(observed);
      }).then(()=>generateFamilyDailyJournalAi(observed)).catch(()=>{}));
    }

    if(plan.dailyNotificationAudit){
      run('notification_audit',auditNotificationLifecycle);
      ctx.waitUntil(cleanupScheduledD1ReadDiagnostics(env.DB));
    }
    if(plan.calendarWatchRenewal) run('calendar_watch_renewal',renewCalendarWatches);
  }
} satisfies ExportedHandler<Env>;
