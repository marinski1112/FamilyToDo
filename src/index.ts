import { json, redirect, html } from './response';
import { makeContext, layout, liffLogin, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, taskEvents, calendar, messages, shopping, toggle, home, loginPage, createFamilyPage, apiMe, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, settingsDiagnostics, settingsDiagnosticsDetail, familyLog, recordOccurrenceFamilyLog, webPushApi, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired, BadRequest, Forbidden, taskVisibilitySql, taskChildVisibilitySql, activityLogVisibilitySql } from './app';
import { openSession, getSessionCookie } from './session';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { sendWebPush, webPushConfigured } from './webpush';
import { familyLogImportApi, familyLogImportPage } from './family-log-import';
import { googleAuthorize, googleFulfillment, googleHomeHealth, googleHomeSettings, googleToken } from './google-home';
import { familyAiQuery, familyAiPlan, familyAiExecute, familyAiConnectionTest, familyAiModelProbe, familyAiModelCatalog } from './family-ai';
import { googleCalendarAuthorize, googleCalendarCallback, integrationsSettings, queueCalendarProjectionAfterMutation, processCalendarOutbox, processCalendarInbound, calendarSyncNow, calendarDisconnect, calendarRetryFailed, calendarBackfill } from './google-calendar';
import { DEFAULT_FAMILY_TIMEZONE, familyDate } from './timezone';

const text = (r: Response) => r;
const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
      if(url.pathname==='/__cf/secrets-health') {
        const names = ['APP_SECRET','LINE_ACCESS_TOKEN','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LIFF_ID','NOTIFY_SECRET','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'] as const;
        const secrets = Object.fromEntries(names.map((name) => [name, { present: typeof env[name] === 'string' && env[name].length > 0, length: typeof env[name] === 'string' ? env[name].length : 0 }]));
        return json({ok:true,worker:env.ENVIRONMENT||'unknown',secrets});
      }
      if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
      if(url.pathname==='/__cf/db-schema-health') return dbSchemaHealth(env);
      if(url.pathname==='/__cf/db-runtime-health') return dbRuntimeHealth(env);
      if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env);return authHealth(context);}
      if(url.pathname==='/__cf/google-home-health') return googleHomeHealth(env);
      if(url.pathname==='/oauth/google/token') return googleToken(request,env);
      if(url.pathname==='/oauth/google-calendar/callback') return googleCalendarCallback(request,env);
      if(url.pathname==='/api/google-home/fulfillment') return googleFulfillment(request,env);
      if(url.pathname==='/liff'||url.pathname==='/liff/') {
        const liffContext=await makeContext(request,env);
        // LIFF起動時に既存のWorkerセッションが有効なら、再度IDトークン検証を要求しない。
        // LINE内ブラウザで他ページが正常表示できるのにトップだけ認証画面へ戻るケースを防ぐ。
        const liffNext=url.searchParams.get('next')||'/app/index.php';
        if(liffContext.member && /^\/(?!\/)/.test(liffNext)) return redirect(liffNext);
        return liffEntryPage(env,liffNext);
      }
      // 認証が必要なページは、例外ベースのリダイレクトに依存せず
      // ルーティング直下で未ログインを処理する。Cloudflare Runtimeでの
      // 例外化/Response処理の差異による1101を避けるため。
      if(url.pathname==='/app/recurring.php') {
        if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));
        const context=await makeContext(request,env);
        if(!context.member) return new Response(null,{status:302,headers:{Location:new URL('/login.php',request.url).toString()}});
        return recurring(request,context);
      }
      const context=await makeContext(request,env);
      if(url.pathname==='/oauth/google/authorize') return googleAuthorize(request,context);
      if(url.pathname==='/oauth/google-calendar/authorize') return googleCalendarAuthorize(request,context);
      if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return liffLogin(request,context);
      if(url.pathname==='/api/family/create') return createFamily(request,context);
      if(url.pathname==='/api/family/join') return joinFamily(request,context);
      if(url.pathname==='/api/family/invite') return inviteCreate(request,context);
      if(url.pathname==='/api/me') return apiMe(context);
      if(url.pathname==='/api/toggle') return toggle(request,context);
      if(url.pathname==='/api/task') return taskApi(request,context);
      if(url.pathname==='/api/item') return itemApi(request,context);
      if(url.pathname==='/api/messages') return messages(request,context);
      if(url.pathname==='/api/shopping') return shopping(request,context);
      if(url.pathname==='/api/family-log') return familyLog(request,context);
      if(url.pathname==='/api/family-ai/query') return familyAiQuery(request,context);
      if(url.pathname==='/api/family-ai/plan') return familyAiPlan(request,context);
      if(url.pathname==='/api/family-ai/execute') return familyAiExecute(request,context);
      if(url.pathname==='/api/family-ai/connection-test') return familyAiConnectionTest(request,context);
      if(url.pathname==='/api/family-ai/model-probe') return familyAiModelProbe(request,context);
      if(url.pathname==='/api/family-ai/model-catalog') return familyAiModelCatalog(request,context);
      if(url.pathname==='/api/settings/diagnostics-detail') return settingsDiagnosticsDetail(request,context);
      if(url.pathname==='/api/google-calendar/sync') return calendarSyncNow(request,context);
      if(url.pathname==='/api/google-calendar/backfill') return calendarBackfill(request,context);
      if(url.pathname==='/api/google-calendar/disconnect') return calendarDisconnect(request,context);
      if(url.pathname==='/api/google-calendar/retry-failed') return calendarRetryFailed(request,context);
      if(url.pathname==='/api/family-log-import') return familyLogImportApi(request,context);
      if(url.pathname==='/api/recurrence/family-log-complete') return recordOccurrenceFamilyLog(request,context);
      if(url.pathname==='/api/settings') return settings(request,context);
      if(url.pathname==='/api/push/subscribe'||url.pathname==='/api/push/unsubscribe'||url.pathname==='/api/push/test') return webPushApi(request,context);
      if(url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php') return loginPage(env,url.searchParams.get('next')||'/app/index.php');
      if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return liffConfigDiagnose(env);
      if(url.pathname==='/app/create.php'||url.pathname==='/app/create') return createFamilyPage(context);
      if(url.pathname==='/app/join.php'||url.pathname==='/app/join') return url.searchParams.get('token') ? invitePage(context,url.searchParams.get('token')||'') : createFamilyPage(context);
      if(url.pathname==='/family/create.php'||url.pathname==='/family/create') return createFamilyPage(context);
      if(url.pathname==='/family/join.php'||url.pathname==='/family/join') return invitePage(context,url.searchParams.get('token')||'');
      if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return home(context);
      if(url.pathname==='/today.php') return today(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/tomorrow.php') return tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/app/tasks.php') return taskEvents(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
      if(url.pathname==='/app/calendar.php') return calendar(request,context,url.searchParams.get('month')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)).slice(0,7));
      if(url.pathname==='/app/messages.php') return messages(request,context);
      if(url.pathname==='/app/shopping.php') return shopping(request,context);
      if(url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php') return familyLog(request,context);
      if(url.pathname==='/app/family_log_import.php') return familyLogImportPage(context);
      if(url.pathname==='/app/settings.php') return settings(request,context);
      if(url.pathname==='/app/settings_google_home.php') return googleHomeSettings(request,context);
      if(url.pathname==='/app/settings_integrations.php') return integrationsSettings(request,context);
      if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return toggle(request,context);
      if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return reorderApi(request,context);
      if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return webhook(request,env);
      if(url.pathname==='/logout.php'||url.pathname==='/logout') return logout(request,env);
      if(url.pathname==='/task/delete.php') return taskDelete(request,context);
      if(url.pathname==='/task/convert_occurrence.php') return convertOccurrence(request,context);
      if(url.pathname==='/app/message_new.php') return messageNew(context);
      if(url.pathname==='/app/shopping_new.php') return shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/app/settings_content.php') return settingsContent(context);
      if(url.pathname==='/app/settings_diagnostics.php') return settingsDiagnostics(context);
      if(url.pathname==='/app/settings_members.php') return settingsMembers(request,context);
      if(url.pathname==='/app/settings_notifications.php') return settingsNotifications(request,context);
      if(url.pathname==='/app/settings_recurring.php') return recurring(request,context);
      if(url.pathname==='/app/logs.php') return logsPage(context);
      if(url.pathname==='/task/new.php') return taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');
      if(url.pathname==='/task/view.php') return taskView(context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/task/edit.php') return taskEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/item/new.php') return itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/item/edit.php') return itemEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/app/shopping_edit.php') return shoppingEdit(request,context,Number(url.searchParams.get('id')||0));
      return env.ASSETS.fetch(request);
    }catch(e:any){
      if(e instanceof AuthRequired) return redirect('/login.php');
      if(e instanceof BadRequest) return json({ok:false,error:e.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
      if(e instanceof Forbidden) return json({ok:false,error:e.message||'この操作は許可されていません。',code:'FORBIDDEN'},403);
      const message=String(e?.message||e||'内部エラーです。');
      const requestId=crypto.randomUUID();
      console.error('[Family TODO LINE] request failure', { path:url.pathname, method:request.method, name:e?.name||'Error', message, requestId });
      if(/no such (table|column)|has no column named|no column named/i.test(message)) {
        return json({ok:false,error:'D1のデータベース構成または制約がWorkerの最新版と一致していません。/ __cf/db-schema-health と /__cf/db-runtime-health を確認してください。',code:'DB_SCHEMA_MIGRATION_REQUIRED',path:url.pathname,request_id:requestId},503);
      }
      return json({ok:false,error:'内部エラーです。',code:'INTERNAL_ERROR',path:url.pathname,request_id:requestId},500);
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext){
    console.log(`[Family TODO LINE] scheduled ${controller.cron}; processing notifications`);
    ctx.waitUntil(processNotifications(env));
    ctx.waitUntil(processCalendarOutbox(env));
    ctx.waitUntil(processCalendarInbound(env));
  }
} satisfies ExportedHandler<Env>;

async function dbSchemaHealth(env:Env):Promise<Response>{
  const required:Record<string,string[]>= {
    families:['id','timezone'],
    member_permissions:['family_id','member_id','permission_key','granted_by','created_at'],
    family_log_time_repairs:['id','family_id','import_batch_id','repair_type','offset_minutes','affected_count','skipped_edited_count','performed_by','performed_at','rolled_back_at'],
    members:['id','family_id','active','notification_enabled','notification_channel','deleted_at'],
    tasks:['id','family_id','title','status','completion_mode','calendar_visible','calendar_color','task_kind','reminder_at','visibility_scope','private_owner_id'],
    task_assignees:['task_id','member_id'],
    task_completions:['task_id','member_id'],
    task_completion_history:['task_id','member_id','action','occurred_at'],
    items:['id','family_id','status','completion_mode'],
    item_assignees:['item_id','member_id'],
    item_completions:['item_id','member_id'],
    shopping_items:['id','family_id','status','task_id'],
    shopping_assignees:['shopping_item_id','member_id'],
    shopping_completions:['shopping_item_id','member_id'],
    recurrence_rules:['id','family_id','task_id','name','active','deleted_at'],
    recurrence_occurrences:['id','family_id','recurrence_rule_id'],
    recurrence_occurrence_completions:['occurrence_id','member_id'],
    notifications:['id','family_id','member_id','target_type','target_id','status','notify_at'],
    notification_settings:['family_id','member_id'],
    activity_logs:['family_id','member_id','action','occurred_at'],
    family_invitations:['id','family_id','token_hash','expires_at','used_at','used_by','family_log_subject_id'],
    deleted_completion_history:['family_id','entity_type','entity_id','member_id','action','occurred_at','archived_at'],
    web_push_subscriptions:['id','family_id','member_id','endpoint','p256dh','auth','enabled','failure_count','updated_at'],
    family_log_subjects:['id','family_id','name','subject_kind','enabled_types_json','show_on_family_overview','overview_quick_types_json','auto_complete_linked_task','active','created_at','updated_at'],
    family_logs:['id','family_id','subject_id','log_type','occurred_at','duration_minutes','linked_task_id','linked_occurrence_id','quick_chore_id','task_family_log_template_id','import_batch_id','import_source_key','deleted_at'],
    family_log_import_batches:['id','family_id','subject_id','source','source_hash','record_count','imported_count','skipped_count','error_count','created_by','created_at','rolled_back_at','rolled_back_by','status','processed_count','failed_at','completed_at','chunk_manifest_json'],
    task_family_log_templates:['id','family_id','task_id','subject_id','log_type','active','created_by','created_at','updated_at'],
    family_log_timers:['id','family_id','subject_id','log_type','started_at','started_at_ms','status','updated_at'],
    family_quick_chores:['id','family_id','name','icon','sort_order','active','weekday_mask','created_by','created_at','updated_at'],
    google_home_authorization_codes:['id','code_hash','family_id','member_id','client_id','redirect_uri','expires_at','used_at','created_at'],
    google_home_tokens:['id','family_id','member_id','access_token_hash','refresh_token_hash','access_expires_at','revoked_at','created_at','updated_at'],
    external_command_receipts:['id','provider','family_id','member_id','request_id','command_key','status','error_code','created_at','updated_at'],
    external_calendar_accounts:['id','family_id','member_id','provider','refresh_token_ciphertext','token_key_version','calendar_id','status','last_synced_at','last_error'],
    external_calendar_links:['id','family_id','task_id','provider','calendar_id','external_event_id','external_etag','last_synced_at','deleted_at'],
    calendar_sync_outbox:['id','family_id','task_id','provider','operation','status','retry_count','next_retry_at','last_error'],
    calendar_sync_state:['id','family_id','provider','calendar_id','sync_token','last_synced_at'],
  };
  const tables:any[]=[];
  let migrationRows:any[]=[];
  try { migrationRows=(await env.DB.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all()).results as any[]; } catch(e) { migrationRows=[]; }
  for(const [table,columns] of Object.entries(required)) {
    try {
      const info=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results as any[];
      const have=new Set(info.map((r:any)=>String(r.name)));
      const missing=columns.filter(c=>!have.has(c));
      tables.push({table,exists:info.length>0,missing});
    } catch(e:any) { tables.push({table,exists:false,missing:columns,error:String(e?.message||e)}); }
  }
  const failed=tables.filter(x=>!x.exists||x.missing.length);
  return json({ok:failed.length===0,database:'reachable',schema_ok:failed.length===0,migrations:migrationRows,tables,failed_count:failed.length});
}

async function dbRuntimeHealth(env:Env):Promise<Response>{
  const checks:[string,string][]=[
    ['families','SELECT id,timezone FROM families LIMIT 1'],
    ['member_permissions','SELECT family_id,member_id,permission_key,granted_by,created_at FROM member_permissions LIMIT 1'],
    ['family_log_time_repairs','SELECT id,family_id,import_batch_id,repair_type,offset_minutes,affected_count,skipped_edited_count,performed_by,performed_at,rolled_back_at FROM family_log_time_repairs LIMIT 1'],
    ['members',"SELECT id,name,role,active,notification_enabled,notification_channel,deleted_at FROM members LIMIT 1"],
    ['tasks','SELECT id,family_id,title,status,completion_mode,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id FROM tasks LIMIT 1'],
    ['task_assignees','SELECT task_id,member_id FROM task_assignees LIMIT 1'],
    ['task_completions','SELECT task_id,member_id,completed_at FROM task_completions LIMIT 1'],
    ['task_completion_history','SELECT task_id,member_id,action,occurred_at FROM task_completion_history LIMIT 1'],
    ['items','SELECT id,family_id,name,status,completion_mode,due_at,task_id,group_key FROM items LIMIT 1'],
    ['item_assignees','SELECT item_id,member_id FROM item_assignees LIMIT 1'],
    ['item_completions','SELECT item_id,member_id,completed_at FROM item_completions LIMIT 1'],
    ['shopping_items','SELECT id,family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url FROM shopping_items LIMIT 1'],
    ['shopping_assignees','SELECT shopping_item_id,member_id FROM shopping_assignees LIMIT 1'],
    ['shopping_completions','SELECT shopping_item_id,member_id,completed_at FROM shopping_completions LIMIT 1'],
    ['notification_settings','SELECT family_id,member_id,enabled,before_day,morning,one_hour_before FROM notification_settings LIMIT 1'],
    ['notifications','SELECT id,family_id,member_id,type,target_type,target_id,notify_at,status,message FROM notifications LIMIT 1'],
    ['recurrence_rules','SELECT id,family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,deleted_at,weekdays_json,monthdays_json,week_numbers_json FROM recurrence_rules LIMIT 1'],
    ['recurrence_occurrences','SELECT id,family_id,recurrence_rule_id,status,occurrence_date FROM recurrence_occurrences LIMIT 1'],
    ['recurrence_occurrence_completions','SELECT occurrence_id,member_id,completed_at FROM recurrence_occurrence_completions LIMIT 1'],
    ['activity_logs','SELECT family_id,member_id,action,target_type,target_id,occurred_at FROM activity_logs LIMIT 1'],
    ['family_invitations','SELECT id,family_id,token_hash,expires_at,used_at,used_by,family_log_subject_id FROM family_invitations LIMIT 1'],
    ['deleted_completion_history','SELECT family_id,entity_type,entity_id,member_id,action,occurred_at,archived_at FROM deleted_completion_history LIMIT 1'],
    ['web_push_subscriptions','SELECT id,family_id,member_id,endpoint,p256dh,auth,enabled,failure_count,last_success_at,last_error,updated_at FROM web_push_subscriptions LIMIT 1'],
    ['family_log_subjects','SELECT id,family_id,member_id,name,subject_kind,birth_date,enabled_types_json,show_on_family_overview,overview_quick_types_json,auto_complete_linked_task,active,created_by,created_at,updated_at FROM family_log_subjects LIMIT 1'],
    ['family_logs','SELECT id,family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,quick_chore_id,task_family_log_template_id,import_batch_id,import_source_key,import_source_text,import_source_page,import_external_id,created_by,created_at,updated_at,deleted_at FROM family_logs LIMIT 1'],
    ['family_log_import_batches','SELECT id,family_id,subject_id,source,source_filename,source_hash,record_count,imported_count,skipped_count,error_count,created_by,created_at,rolled_back_at,rolled_back_by,status,processed_count,failed_at,completed_at,chunk_manifest_json FROM family_log_import_batches LIMIT 1'],
    ['family_log_import_integrity',"SELECT (SELECT COUNT(*) FROM family_log_import_batches b WHERE NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=b.subject_id AND s.family_id=b.family_id)) + (SELECT COUNT(*) FROM family_logs l JOIN family_log_import_batches b ON b.id=l.import_batch_id WHERE b.family_id<>l.family_id) + (SELECT COUNT(*) FROM family_logs l JOIN family_log_import_batches b ON b.id=l.import_batch_id WHERE b.rolled_back_at IS NOT NULL AND l.deleted_at IS NULL AND l.updated_at=l.created_at) issues"],
    ['task_family_log_templates','SELECT id,family_id,task_id,subject_id,log_type,detail_code,amount,unit,duration_minutes,value_text,note,active,created_by,created_at,updated_at FROM task_family_log_templates LIMIT 1'],
    ['family_log_timers','SELECT id,family_id,subject_id,log_type,started_at,started_at_ms,status,created_by,created_at,updated_at FROM family_log_timers LIMIT 1'],
    ['family_quick_chores','SELECT id,family_id,name,icon,sort_order,active,weekday_mask,created_by,created_at,updated_at FROM family_quick_chores LIMIT 1'],
    ['google_home_authorization_codes','SELECT id,code_hash,family_id,member_id,client_id,redirect_uri,expires_at,used_at,created_at FROM google_home_authorization_codes LIMIT 1'],
    ['google_home_tokens','SELECT id,family_id,member_id,access_token_hash,refresh_token_hash,access_expires_at,revoked_at,created_at,updated_at FROM google_home_tokens LIMIT 1'],
    ['external_command_receipts','SELECT id,provider,family_id,member_id,request_id,command_key,status,error_code,created_at,updated_at FROM external_command_receipts LIMIT 1'],
    ['external_calendar_accounts','SELECT id,family_id,member_id,provider,token_key_version,calendar_id,status,last_synced_at,last_error FROM external_calendar_accounts LIMIT 1'],
    ['external_calendar_links','SELECT id,family_id,task_id,provider,calendar_id,external_event_id,external_etag,last_synced_at,deleted_at FROM external_calendar_links LIMIT 1'],
    ['calendar_sync_outbox','SELECT id,family_id,task_id,provider,operation,status,retry_count,next_retry_at,last_error FROM calendar_sync_outbox LIMIT 1'],
    ['calendar_sync_state','SELECT id,family_id,provider,calendar_id,sync_token,last_synced_at FROM calendar_sync_state LIMIT 1'],
    ['family_log_page_timer_join',"SELECT x.id,s.name subject_name FROM family_log_timers x LEFT JOIN family_log_subjects s ON s.id=x.subject_id WHERE x.family_id=-1 AND x.status='running' ORDER BY x.started_at_ms LIMIT 1"],
    ['family_log_sleep_timer_integrity',"SELECT (SELECT COUNT(*) FROM family_log_timers x LEFT JOIN family_log_subjects s ON s.id=x.subject_id AND s.family_id=x.family_id WHERE x.log_type='SLEEP' AND x.status='running' AND COALESCE(s.subject_kind,'') NOT IN ('BABY','CHILD')) + (SELECT COUNT(*) FROM (SELECT family_id,subject_id FROM family_log_timers WHERE log_type='SLEEP' AND status='running' GROUP BY family_id,subject_id HAVING COUNT(*)>1)) + (SELECT COUNT(*) FROM family_log_timers WHERE log_type='SLEEP' AND status='running' AND (started_at_ms IS NULL OR started_at_ms<=0 OR started_at_ms>unixepoch('now')*1000 OR started_at_ms<(unixepoch('now')-172800)*1000)) issues"],
  ];
  const results:any[]=[];
  for(const [name,sql] of checks){
    try { await env.DB.prepare(sql).first(); results.push({name,ok:true}); }
    catch(e:any){ results.push({name,ok:false,error:String(e?.message||e)}); }
  }
  const failed=results.filter(x=>!x.ok);
  return json({ok:failed.length===0,database:'reachable',checks:results,failed_count:failed.length});
}

async function liffConfigDiagnose(env:Env):Promise<Response>{
  const liffId=String(env.LINE_LIFF_ID||'');
  const channelId=String(env.LINE_CHANNEL_ID||'');
  let prefix='';
  let matches=false;
  if(liffId.includes('-')){ prefix=liffId.split('-',1)[0]; matches=Boolean(channelId)&&prefix===channelId; }
  return new Response([
    'LIFF configuration diagnostic',
    '=============================',
    `line_liff_id present: ${liffId?'YES':'NO'}`,
    `line_channel_id present: ${channelId?'YES':'NO'}`,
    prefix?`LIFF ID channel prefix: ${prefix}`:'LIFF ID channel prefix: (unavailable)',
    `Configured Channel ID: ${channelId||'(missing)'}`,
    `Channel ID matches LIFF prefix: ${prefix?(matches?'YES':'NO'):'N/A'}`,
    'Runtime: Cloudflare Workers',
  ].join('\n')+'\n',{headers:{'content-type':'text/plain; charset=utf-8'}});
}

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
  const body=`<div class="card form-card"><h1>📝 タスク・イベント追加</h1><form id="taskForm" autocomplete="off"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>タイトル</label><input name="title" required maxlength="255" autofocus><label class="checkrow"><input id="isEvent" type="checkbox" name="is_event"><span>イベントとして登録（誕生日・有給など）</span></label><p class="small event-help">イベントはチェックボックスと期限切れ判定の対象外です。日付・通知・場所・カレンダー色などは通常タスクと同じです。</p><label>説明</label><textarea name="description" maxlength="5000"></textarea><label class="checkrow private-task-option"><input id="isPrivate" type="checkbox" name="is_private"><span>🔒 自分専用</span></label><p class="small private-task-help">他の家族にはタスク・カレンダー・詳細を表示しません</p><label>日付</label><div class="date-option-row task-date-row"><div><span class="small">開始日</span><input id="taskDate" type="date" name="dateOnly" value="${date}"></div><div id="endDateWrap"><span class="small">終了日</span><input id="taskEndDate" type="date" name="endDateOnly" value="${date}"></div><label class="checkrow"><input id="noDate" type="checkbox" name="noDate"><span>期限なし（未整理）</span></label></div><label class="checkrow"><input id="allDay" type="checkbox" name="allDay" checked><span>終日</span></label><div id="dateTimes" class="task-time-fields" style="display:none"><div class="field-block"><label>開始時刻</label><input type="time" name="startTime"></div><div class="field-block"><label>終了時刻</label><input type="time" name="endTime"></div></div><label>場所</label><input name="location"><label>カレンダー表示</label><label class="checkrow"><input id="taskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label><div id="taskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div><div id="taskCompletionWrap"><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select></div><label>担当者</label><div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}</div><label>通知日時（任意）</label><input type="datetime-local" name="reminderAt"><p class="small">指定すると担当者へタスク詳細を設定した通知方法で通知します。通知設定はON/OFFのみです。</p><div class="sub-card"><button type="button" class="section-button" id="shoppingToggle">＋ このタスクに買い物を追加</button><div id="shoppingBox" style="display:none"><label>カテゴリー</label><select name="shopping_category"><option value="">カテゴリーなし</option>${categories.results.map((c:any)=>`<option value="${String(c.category).replace(/[&<>\"]/g,'')}">${String(c.category).replace(/[&<>\"]/g,'')}</option>`).join('')}<option value="__custom__">自由入力</option></select><input id="shoppingCustom" name="shopping_category_custom" placeholder="新しいカテゴリー" style="display:none"><div id="shoppingRows"><div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input type="text" name="shopping_quantity[]" value="1" inputmode="numeric" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div></div><button type="button" class="btn gray small" id="addShoppingRow">＋ 商品を追加</button></div></div><div class="sub-card"><button type="button" class="section-button" id="itemsToggle">＋ このタスクに持ち物を追加</button><div id="itemsBox" style="display:none"><div id="itemRows"><div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div></div><button type="button" class="btn gray small" id="addItemRow">＋ 持ち物を追加</button></div></div><button>登録する</button></form></div><script type="application/json" id="taskNewPayload">${JSON.stringify({returnTo}).replaceAll('<','\u003c').replaceAll('>','\u003e').replaceAll('&','\u0026')}</script><script src="/assets/task-new.js?v=12.102-wave83"></script>`;
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
    try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); } catch { /* deletion remains authoritative */ }
    return json({ok:true});
  }
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const title=String(b.title??'').trim();const date=String(b.dateOnly??'').trim();const isEvent=Boolean(b.is_event);const noDate=!isEvent&&(Boolean(b.noDate)||date==='');
  if(!title)return json({ok:false,error:'タイトルを入力してください。'},400);
  if(isEvent&&!date)return json({ok:false,error:'イベントには日付を指定してください。'},400);
  if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({ok:false,error:'日付が不正です。'},400);
  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate))return json({ok:false,error:'終了日が不正です。'},400); if(!noDate&&endDate<date)return json({ok:false,error:'終了日は開始日以降にしてください。'},400); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();
  const normalizeDateTime=(v:string,baseDate:string)=>{if(!v)return null; if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))return v.replace('T',' ')+':00'; if(/^\d{2}:\d{2}$/.test(v))return `${baseDate} ${v}:00`; return null;};
  const start=noDate?null:(allDay?`${date} 00:00:00`:normalizeDateTime(st,date));const end=noDate?null:(allDay?(endDate!==date?`${endDate} 23:59:59`:null):normalizeDateTime(et,endDate||date));
  if(!noDate&&!allDay&&!start)return json({ok:false,error:'開始日時を指定してください。'},400);
  if(st&&!start)return json({ok:false,error:'開始日時が不正です。'},400); if(et&&!end)return json({ok:false,error:'終了日時が不正です。'},400);
  if(start&&end&&end<start)return json({ok:false,error:'終了日時は開始日時以降にしてください。'},400);
  const reminderRaw=String(b.reminderAt??'').trim();
  const reminderAt=reminderRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
  if(reminderRaw && !reminderAt)return json({ok:false,error:'通知日時が不正です。'},400);
  const shoppingPre=Array.isArray(b.shopping)?(b.shopping as any[]).slice(0,50):[];
  for(const v of shoppingPre){const u=String(v?.url||'').trim();if(u){try{const parsed=new URL(u);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{return json({ok:false,error:'買い物URLが不正です。'},400);}}}
  const now=nowJst();const isPrivate=!isEvent&&(b.is_private===true||String(b.is_private)==='1'||String(b.visibility_scope)==='PRIVATE');const completionMode=isPrivate?'ANY':(String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY');
  const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
  const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
  const dueValue=noDate?null:(end||start||`${date} 00:00:00`);
  const ids=isPrivate?[Number(m.id)]:[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
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
      ]); } catch(cleanup){ console.error('[Family TODO LINE] task creation cleanup failed',{taskId:id,error:String((cleanup as any)?.message||cleanup)}); }
    }
    throw e;
  }

  try { await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id); } catch { /* local task remains authoritative */ }
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
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { console.error(e); }
      }
    }
  } catch(e) { console.error('[Family TODO LINE] webhook',e); }
  return new Response('OK',{status:200});
}

async function cleanupNotificationLifecycle(env: Env): Promise<void> {
  const now=nowJst();
  // Operational activity audit is retained for 31 JST calendar days. Domain
  // completion histories and Family Log are intentionally untouched.
  await env.DB.prepare("DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')").bind(now).run();
  // Disable pending work for members who opted out/deactivated, or whose family no longer matches the notification.
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND (member_id IN (SELECT id FROM members WHERE active=0 OR notification_enabled=0) OR NOT EXISTS (SELECT 1 FROM members m WHERE m.id=notifications.member_id AND m.family_id=notifications.family_id))").bind(now).run();
  await env.DB.prepare("UPDATE web_push_subscriptions SET enabled=0,last_error='member inactive or deleted',updated_at=? WHERE enabled=1 AND (NOT EXISTS(SELECT 1 FROM members m WHERE m.id=web_push_subscriptions.member_id AND m.family_id=web_push_subscriptions.family_id) OR EXISTS(SELECT 1 FROM members m WHERE m.id=web_push_subscriptions.member_id AND (m.active=0 OR m.deleted_at IS NOT NULL)))").bind(now).run();
  // Remove operational reminders whose task is gone/completed. Recurring-template reminders are also cancelled when the series is stopped/deleted.
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND target_type='task' AND (target_id IS NULL OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id) OR EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id AND t.status='completed') OR EXISTS (SELECT 1 FROM tasks t LEFT JOIN recurrence_rules r ON r.task_id=t.id AND r.family_id=t.family_id WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id AND lower(COALESCE(t.task_kind,'')) IN ('recurring','recurrence_template') AND (r.id IS NULL OR r.active=0 OR r.deleted_at IS NOT NULL)))").bind(now).run();
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND target_type='task' AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id AND t.visibility_scope='PRIVATE' AND (t.private_owner_id IS NULL OR t.private_owner_id<>notifications.member_id))").bind(now).run();
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND target_type='message' AND (target_id IS NULL OR NOT EXISTS (SELECT 1 FROM messages x WHERE x.id=notifications.target_id AND x.family_id=notifications.family_id))").bind(now).run();

  // Clear stale conversion pointers when their converted destination has already been deleted.
  await env.DB.prepare("UPDATE messages SET converted_to_task_id=NULL,updated_at=? WHERE converted_to_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=messages.converted_to_task_id AND t.family_id=messages.family_id)").bind(now).run();
  await env.DB.prepare("UPDATE messages SET converted_to_shopping_id=NULL,updated_at=? WHERE converted_to_shopping_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shopping_items s WHERE s.id=messages.converted_to_shopping_id AND s.family_id=messages.family_id)").bind(now).run();

  // Standalone shopping/items are valid, so detach only impossible cross-family/deleted task links instead of deleting the child record.
  await env.DB.prepare("UPDATE shopping_items SET task_id=NULL,updated_at=? WHERE task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=shopping_items.task_id AND t.family_id=shopping_items.family_id)").bind(now).run();
  await env.DB.prepare("UPDATE items SET task_id=NULL,updated_at=? WHERE task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=items.task_id AND t.family_id=items.family_id)").bind(now).run();

  // If legacy/import data somehow bypassed the partial unique index, keep the oldest active reminder and cancel the rest before send.
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND EXISTS (SELECT 1 FROM notifications keep WHERE keep.id<notifications.id AND keep.family_id=notifications.family_id AND keep.member_id=notifications.member_id AND keep.target_type=notifications.target_type AND COALESCE(keep.target_id,-1)=COALESCE(notifications.target_id,-1) AND keep.notify_at=notifications.notify_at AND keep.status IN ('pending','retry'))").bind(now).run();

  const [dup,orphan,orphanExceptions,orphanRules,staleMessageLinks,staleTaskChildren,orphanOperationalRows,archiveDuplicates,archiveMemberMismatch,familyLogLinkIssues,promotionInviteIssues,taskFamilyLogTemplateIssues]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) c FROM (SELECT family_id,member_id,target_type,target_id,notify_at,COUNT(*) n FROM notifications WHERE status IN ('pending','retry') GROUP BY family_id,member_id,target_type,target_id,notify_at HAVING COUNT(*)>1)").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM notifications n WHERE n.status IN ('pending','retry') AND ((n.target_type='task' AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=n.target_id AND t.family_id=n.family_id)) OR (n.target_type='message' AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.id=n.target_id AND m.family_id=n.family_id)))").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM recurrence_occurrences o WHERE o.exception_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=o.exception_task_id AND t.family_id=o.family_id)").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM recurrence_rules r WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=r.task_id AND t.family_id=r.family_id)").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM messages m WHERE (m.converted_to_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=m.converted_to_task_id AND t.family_id=m.family_id)) OR (m.converted_to_shopping_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.id=m.converted_to_shopping_id AND s.family_id=m.family_id))").first<any>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM shopping_items s WHERE s.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id)) + (SELECT COUNT(*) FROM items i WHERE i.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id)) c").first<any>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM task_assignees a WHERE NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=a.task_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=a.member_id)) + (SELECT COUNT(*) FROM item_assignees a WHERE NOT EXISTS(SELECT 1 FROM items i WHERE i.id=a.item_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=a.member_id)) + (SELECT COUNT(*) FROM shopping_assignees a WHERE NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.id=a.shopping_item_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=a.member_id)) + (SELECT COUNT(*) FROM task_completion_history h WHERE NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=h.task_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=h.member_id)) + (SELECT COUNT(*) FROM item_completion_history h WHERE NOT EXISTS(SELECT 1 FROM items i WHERE i.id=h.item_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=h.member_id)) + (SELECT COUNT(*) FROM shopping_completion_history h WHERE NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.id=h.shopping_item_id) OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=h.member_id)) c").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM (SELECT family_id,entity_type,entity_id,COALESCE(member_id,-1) member_key,action,occurred_at,COALESCE(source_type,''),COALESCE(source_id,-1),COUNT(*) n FROM deleted_completion_history GROUP BY family_id,entity_type,entity_id,member_key,action,occurred_at,COALESCE(source_type,''),COALESCE(source_id,-1) HAVING COUNT(*)>1)").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM deleted_completion_history h WHERE h.member_id IS NOT NULL AND EXISTS(SELECT 1 FROM members m WHERE m.id=h.member_id AND m.family_id<>h.family_id)").first<any>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM family_log_subjects s WHERE s.member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=s.member_id AND m.family_id=s.family_id)) + (SELECT COUNT(*) FROM family_logs l WHERE l.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=l.subject_id AND s.family_id=l.family_id)) + (SELECT COUNT(*) FROM family_log_timers x WHERE x.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=x.subject_id AND s.family_id=x.family_id)) + (SELECT COUNT(*) FROM family_logs l WHERE l.quick_chore_id IS NOT NULL AND (l.log_type<>'HOUSEWORK' OR NOT EXISTS(SELECT 1 FROM family_quick_chores q WHERE q.id=l.quick_chore_id AND q.family_id=l.family_id))) c").first<any>(),
    env.DB.prepare("SELECT COUNT(*) c FROM family_invitations i WHERE i.family_log_subject_id IS NOT NULL AND i.used_at IS NULL AND i.expires_at>? AND (NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1) OR EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1 AND s.member_id IS NOT NULL))").bind(now).first<any>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM task_family_log_templates ft WHERE NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=ft.task_id AND t.family_id=ft.family_id) OR (ft.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.id=ft.subject_id AND s.family_id=ft.family_id AND s.active=1)) OR ft.log_type NOT IN ('MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','CONDITION','WEIGHT','HEIGHT','BLOOD_PRESSURE','EXERCISE','WATER','TOILET','WALK','HOUSEWORK','MEMO') OR (ft.log_type='HOUSEWORK' AND ft.subject_id IS NOT NULL)) + (SELECT COUNT(*) FROM family_logs l WHERE l.task_family_log_template_id IS NOT NULL AND (l.linked_occurrence_id IS NULL OR NOT EXISTS(SELECT 1 FROM task_family_log_templates ft WHERE ft.id=l.task_family_log_template_id AND ft.family_id=l.family_id) OR NOT EXISTS(SELECT 1 FROM recurrence_occurrences o WHERE o.id=l.linked_occurrence_id AND o.family_id=l.family_id) OR NOT EXISTS(SELECT 1 FROM task_family_log_templates ft JOIN recurrence_occurrences o ON o.id=l.linked_occurrence_id JOIN recurrence_rules r ON r.id=o.recurrence_rule_id WHERE ft.id=l.task_family_log_template_id AND ft.task_id=r.task_id AND ft.family_id=o.family_id))) c").first<any>()
  ]);
  const audit={duplicate_groups:Number(dup?.c||0),orphan_pending:Number(orphan?.c||0),orphan_exception_links:Number(orphanExceptions?.c||0),orphan_recurrence_rules:Number(orphanRules?.c||0),stale_message_conversion_links:Number(staleMessageLinks?.c||0),stale_task_child_links:Number(staleTaskChildren?.c||0),orphan_operational_rows:Number(orphanOperationalRows?.c||0),deleted_archive_duplicate_groups:Number(archiveDuplicates?.c||0),deleted_archive_member_family_mismatch:Number(archiveMemberMismatch?.c||0),family_log_link_issues:Number(familyLogLinkIssues?.c||0),promotion_invite_issues:Number(promotionInviteIssues?.c||0),task_family_log_template_issues:Number(taskFamilyLogTemplateIssues?.c||0)};
  if(Object.values(audit).some(v=>v>0)) console.warn('[Family TODO LINE] lifecycle audit',audit);
}

async function processNotifications(env: Env): Promise<void> {
  await cleanupNotificationLifecycle(env);
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id,COALESCE(m.notification_channel,'LINE') notification_channel FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status IN ('pending','retry') AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all();
  for(const n of due.results) {
    try {
      const channel=String(n.notification_channel||'LINE').toUpperCase();
      if(channel==='WEB_PUSH'){
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
      }else{
        if(!n.line_user_id)throw new Error('LINE user id is not linked.');
        const { pushLineMessage } = await import('./line');
        await pushLineMessage(env.LINE_ACCESS_TOKEN,String(n.line_user_id),String(n.message||'Family TODO LINEからのお知らせです。'));
      }
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=?,updated_at=? WHERE id=?').bind('sent',nowJst(),nowJst(),n.id).run();
    } catch(e) {
      const current=await env.DB.prepare('SELECT COALESCE(attempt_count,0) attempt_count FROM notifications WHERE id=?').bind(n.id).first();
      const attempts=Number(current?.attempt_count||0)+1;
      const status=attempts>=5?'error':'retry';
      await env.DB.prepare('UPDATE notifications SET status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?').bind(status,attempts,String(e instanceof Error?e.message:e).slice(0,1000),nowJst(),n.id).run().catch(()=>{});
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
  await ctx.env.DB.batch(statements);
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

async function logsPage(ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/login.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN') return html(layout('活動ログ','<div class="card"><h1>📊 家族の活動ログ</h1><p>活動ログを見るには管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>','/app/settings.php'));
  const u=new URL(ctx.request.url), days=String(u.searchParams.get('days')||'7'), member=Number(u.searchParams.get('member')||0), type=String(u.searchParams.get('type')||''), action=String(u.searchParams.get('action')||''), page=Math.max(1,Number(u.searchParams.get('page')||1)||1);
  const from=String(u.searchParams.get('from')||''),to=String(u.searchParams.get('to')||'');
  const where:string[]=['a.family_id=?',activityLogVisibilitySql('a')], params:any[]=[m.family_id,m.id,m.id,m.id];
  if(member>0){where.push('a.member_id=?');params.push(member);}
  const groups:Record<string,string[]>= {task:['task'],item:['item'],shopping:['shopping'],message:['message'],family_log:['family_log','family_log_subject'],chore:['family_quick_chore'],recurring:['recurrence_rule','recurrence_occurrence'],admin:['member','family','invitation','settings']};
  if(groups[type]){where.push(`a.target_type IN (${groups[type].map(()=>'?').join(',')})`);params.push(...groups[type]);}
  const actions:Record<string,string[]>= {CREATED:['CREATED'],UPDATED:['UPDATED'],COMPLETED:['COMPLETED'],UNCOMPLETED:['UNCOMPLETED'],DELETED:['DELETED'],OTHER:['CREATED','UPDATED','COMPLETED','UNCOMPLETED','DELETED']};
  if(action&&action!=='OTHER'){where.push('a.action=?');params.push(action);}else if(action==='OTHER'){where.push(`a.action NOT IN (${actions.OTHER.map(()=>'?').join(',')})`);params.push(...actions.OTHER);}
  if(days==='custom'&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)){where.push("date(a.occurred_at) BETWEEN date(?) AND date(?)");params.push(from,to);}
  else {const n=days==='today'?0:([7,30].includes(Number(days))?Number(days)-1:6);where.push("date(a.occurred_at)>=date(?,'-'||?||' days')");params.push(nowJst(),n);}
  const rows=await ctx.env.DB.prepare(`SELECT a.*,m.name member_name,fl.log_type family_log_type,fl.occurred_at family_log_occurred_at,fl.detail_code family_log_detail_code,fl.amount family_log_amount,fl.unit family_log_unit,fl.duration_minutes family_log_duration_minutes,fl.value_text family_log_value_text,fs.name family_log_subject_name,fss.name target_subject_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id LEFT JOIN family_logs fl ON a.target_type='family_log' AND fl.id=a.target_id AND fl.family_id=a.family_id LEFT JOIN family_log_subjects fs ON fs.id=fl.subject_id AND fs.family_id=fl.family_id LEFT JOIN family_log_subjects fss ON a.target_type='family_log_subject' AND fss.id=a.target_id AND fss.family_id=a.family_id WHERE ${where.join(' AND ')} ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?`).bind(...params,(page-1)*50).all();
  const hasMore=rows.results.length>50;rows.results=rows.results.slice(0,50);
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? ORDER BY id').bind(m.family_id).all();
  const label=(x:string)=>({COMPLETED:'完了',UNCOMPLETED:'未完了に戻す',CREATED:'作成',UPDATED:'更新',DELETED:'削除'} as Record<string,string>)[x]||x;
  const rowHtml=(rows.results as any[]).map(r=>`<div class="row"><strong>${esc(label(String(r.action||'')))}</strong><div class="meta">${esc(r.member_name||'不明')} ・ ${esc(r.occurred_at||'')}</div><div class="meta">${esc(r.target_type||'')}${r.target_id?` #${esc(r.target_id)}`:''}</div></div>`).join('');
  const selected=(v:any,x:any)=>String(v)===String(x)?'selected':'';
  const form=`<details class="card" open><summary><strong>絞り込み</strong></summary><form method="get"><label>期間</label><select name="days"><option value="today" ${selected(days,'today')}>今日</option><option value="7" ${selected(days,'7')}>7日</option><option value="30" ${selected(days,'30')}>30日</option><option value="custom" ${selected(days,'custom')}>期間指定</option></select><div class="date-grid"><input type="date" name="from" value="${esc(from)}"><input type="date" name="to" value="${esc(to)}"></div><label>メンバー</label><select name="member"><option value="0">全員</option>${members.results.map((x:any)=>`<option value="${x.id}" ${selected(member,x.id)}>${esc(x.name)}</option>`).join('')}</select><label>種類</label><select name="type"><option value="">全て</option>${[['task','タスク'],['item','持ち物'],['shopping','買い物'],['message','伝言'],['family_log','家族ログ'],['chore','ちょこっと家事'],['recurring','定期タスク'],['admin','メンバー/管理操作']].map(x=>`<option value="${x[0]}" ${selected(type,x[0])}>${x[1]}</option>`).join('')}</select><label>アクション</label><select name="action"><option value="">全て</option>${[['CREATED','作成'],['UPDATED','更新'],['COMPLETED','完了'],['UNCOMPLETED','未完了へ戻す'],['DELETED','削除'],['OTHER','その他']].map(x=>`<option value="${x[0]}" ${selected(action,x[0])}>${x[1]}</option>`).join('')}</select><button>適用</button></form></details>`;
  const q=new URLSearchParams(u.searchParams);q.set('page',String(page+1));
  const prev=new URLSearchParams(u.searchParams);prev.set('page',String(page-1));
  const paging=`<div class="actions">${page>1?`<a class="btn gray" href="?${prev}">前へ</a>`:''}${hasMore?`<a class="btn" href="?${q}">さらに読み込む</a>`:''}</div>`;
  return html(layout('活動ログ',`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📊 家族の活動ログ</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${form}<div class="card history-card"><p class="small">1ページ50件・activity_logsは31日保持です。</p>${rowHtml||'<p class="empty">ログはありません。</p>'}${paging}</div>`,'/app/settings.php'));
}
