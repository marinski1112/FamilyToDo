import { json } from './response';

export async function dbSchemaHealth(env:Env):Promise<Response>{
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
    calendar_import_batches:['id','family_id','source_format','file_sha256','status','total_count','processed_count','created_by'],
    calendar_import_entries:['id','batch_id','family_id','source_uid','source_recurrence_key','source_hash','task_id','recurrence_rule_id','status'],
    external_google_task_accounts:['id','family_id','member_id','refresh_token_ciphertext','tasklist_id','status','import_visibility','sync_started_at','updated_min','sync_window_updated_min','sync_page_token','sync_latest_seen_at','sync_cycle_started_at'],
    external_google_task_links:['id','family_id','member_id','account_id','task_id','external_tasklist_id','external_task_id','status'],
    external_google_voice_commands:['id','family_id','member_id','account_id','external_tasklist_id','external_task_id','command_type','target_type','target_id','status'],
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

export async function dbRuntimeHealth(env:Env):Promise<Response>{
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
    ['family_log_quick_actions','SELECT id,family_id,subject_id,name,mode,log_type,sort_order FROM family_log_quick_actions LIMIT 1'],
    ['family_quick_chores','SELECT id,family_id,name,icon,sort_order,active,weekday_mask,created_by,created_at,updated_at FROM family_quick_chores LIMIT 1'],
    ['google_home_authorization_codes','SELECT id,code_hash,family_id,member_id,client_id,redirect_uri,expires_at,used_at,created_at FROM google_home_authorization_codes LIMIT 1'],
    ['google_home_tokens','SELECT id,family_id,member_id,access_token_hash,refresh_token_hash,access_expires_at,revoked_at,created_at,updated_at FROM google_home_tokens LIMIT 1'],
    ['external_command_receipts','SELECT id,provider,family_id,member_id,request_id,command_key,status,error_code,created_at,updated_at FROM external_command_receipts LIMIT 1'],
    ['calendar_import_batches','SELECT id,family_id,source_format,source_name,file_sha256,timezone,status,total_count,created_count,updated_count,skipped_count,error_count,processed_count,created_by,created_at,applied_at,rolled_back_at FROM calendar_import_batches LIMIT 1'],
    ['calendar_import_entries','SELECT id,batch_id,family_id,source_uid,source_recurrence_key,source_hash,task_id,recurrence_rule_id,related_to_uid,status FROM calendar_import_entries LIMIT 1'],
    ['calendar_import_integrity',`SELECT
      (SELECT COUNT(*) FROM calendar_import_entries e LEFT JOIN calendar_import_batches b ON b.id=e.batch_id AND b.family_id=e.family_id WHERE b.id IS NULL)
      +(SELECT COUNT(*) FROM calendar_import_batches b WHERE b.processed_count>b.total_count OR (b.status='COMPLETED' AND b.processed_count<>b.total_count))
      +(SELECT COUNT(*) FROM (SELECT family_id,source_format,source_uid,source_recurrence_key FROM calendar_import_entries GROUP BY family_id,source_format,source_uid,source_recurrence_key HAVING COUNT(*)>1))
      +(SELECT COUNT(*) FROM calendar_import_entries e LEFT JOIN tasks t ON t.id=e.task_id AND t.family_id=e.family_id WHERE e.status='ACTIVE' AND t.id IS NULL)
      +(SELECT COUNT(*) FROM calendar_import_entries e LEFT JOIN recurrence_rules r ON r.id=e.recurrence_rule_id AND r.family_id=e.family_id WHERE e.status='ACTIVE' AND e.recurrence_rule_id IS NOT NULL AND r.id IS NULL) issues`],
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

export async function liffConfigDiagnose(env:Env):Promise<Response>{
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

