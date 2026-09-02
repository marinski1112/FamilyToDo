import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { CALENDAR_COLOR_OPTIONS, normalizeCalendarColor } from './calendar-colors';
import { logActivity } from './activity-log';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { archiveRecurrenceRuleOccurrenceStatements, archiveTaskChildCompletionStatements, archiveTaskCompletionStatements } from './lifecycle';
import { validateLiffNext } from './liff-target';
import { matchesRecurrence, parseJsonArray } from './recurrence-projection';
import { bodyJson, RequestBodyParseError } from './request-body';
import { html, json, redirect } from './response';
import { commitSession } from './session';
import { ensureFamilyLogMemberSubjects, familyLogSubjectIcon, FAMILY_LOG_DETAILS, FAMILY_LOG_TYPES, saveTaskFamilyLogTemplate, TaskFamilyLogTemplateInputError, validateTaskFamilyLogTemplateInput } from './task-family-log-template';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
class RecurringBadRequest extends Error {}
class RecurringForbidden extends Error {}

function authRequiredResponse(ctx:AppContext):Response{
  const url=new URL(ctx.request.url),next=validateLiffNext(url.pathname+url.search);
  return redirect(next?`/login.php?next=${encodeURIComponent(next)}`:'/login.php');
}
async function ensureCsrf(ctx:AppContext,token:unknown):Promise<void>{
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof token!=='string'||token!==ctx.session.csrfToken)throw new RecurringForbidden('CSRF検証に失敗しました。');
}

/** Canonical recurring-task settings page retained independently from app.ts. */
export async function recurring(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return authRequiredResponse(ctx);
  try{
    const role=String(m.role||'').toUpperCase();
    const isAdmin=role==='OWNER'||role==='ADMIN';
    if(!isAdmin)return request.method==='GET'
      ? html(layout('定期タスク','<div class="card"><h1>🔁 定期タスク</h1><p>定期タスクの管理には管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>','/app/settings.php'))
      : json({ok:false,error:'管理者権限が必要です。'},403);

    const bodyValues=(value:unknown):unknown[]=>Array.isArray(value)?value:value===undefined||value===null||value===''?[]:[value];
    const numberValues=(value:unknown,min:number,max:number):number[]=>[...new Set(bodyValues(value).flatMap(v=>String(v).split(',')).map(v=>Number(String(v).trim())).filter(n=>Number.isInteger(n)&&n>=min&&n<=max))];
    const stringValues=(value:unknown):string[]=>bodyValues(value).map(v=>String(v).trim()).filter(Boolean);
    const postSuccess=(payload:Record<string,unknown>,result:'saved'|'deleted'|'toggled'|'restored'='saved')=>{
      const accepts=(request.headers.get('accept')||'').toLowerCase();
      const response=accepts.includes('text/html')&&!accepts.includes('application/json')
        ? redirect('/app/recurring.php?result='+encodeURIComponent(result))
        : json({ok:true,result,...payload});
      return commitSession(response,ctx.session,ctx.env.APP_SECRET);
    };

    if(request.method==='POST'){
      const b=await bodyJson(request);
      await ensureCsrf(ctx,b.csrf);
      const action=String(b.action||'create');
      const validatedFamilyLogTemplate=await validateTaskFamilyLogTemplateInput(ctx,b);

      if(action==='toggle'){
        const id=Number(b.id||0);if(!id)throw new RecurringBadRequest('対象が不正です。');
        const active=b.active?1:0,now=nowJst();
        const result=await ctx.env.DB.prepare('UPDATE recurrence_rules SET active=?,updated_at=? WHERE id=? AND family_id=?').bind(active,now,id,m.family_id).run();
        if(!result.meta.changes)return json({ok:false,error:'定期タスクが見つかりません。'},404);
        if(!active){const rule=await ctx.env.DB.prepare('SELECT task_id FROM recurrence_rules WHERE id=? AND family_id=?').bind(id,m.family_id).first<Row>();const taskId=Number(rule?.task_id||0);if(taskId)await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry')").bind(now,m.family_id,taskId).run();}
        return postSuccess({},'toggled');
      }

      if(action==='restore_excluded'){
        const occurrenceId=Number(b.occurrence_id||0);if(!occurrenceId)throw new RecurringBadRequest('発生日が不正です。');
        const excluded=await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status,r.* FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? AND o.status='excluded' LIMIT 1`).bind(occurrenceId,m.family_id).first<Row>();
        if(!excluded)return json({ok:false,error:'除外済み発生日が見つかりません。'},404);
        const occurrenceDate=String(excluded.occurrence_date||'');
        if(occurrenceDate<String(excluded.start_date||'')||(excluded.end_date&&occurrenceDate>String(excluded.end_date))||!matchesRecurrence(excluded,occurrenceDate))throw new RecurringBadRequest('現在の定期ルールではこの日を復活できません。');
        const now=nowJst();
        await ctx.env.DB.prepare("UPDATE recurrence_occurrences SET status='pending',exception_task_id=NULL,completed_by=NULL,completed_at=NULL,updated_at=? WHERE id=? AND family_id=? AND status='excluded'").bind(now,occurrenceId,m.family_id).run();
        await logActivity(ctx,'RESTORED','recurrence_occurrence',occurrenceId,{occurrence_date:occurrenceDate,recurrence_rule_id:Number(excluded.id||0)});
        return postSuccess({occurrence_id:occurrenceId},'restored');
      }

      if(action==='delete'){
        const id=Number(b.id||0);if(!id)throw new RecurringBadRequest('対象が不正です。');
        const rule=await ctx.env.DB.prepare('SELECT id,task_id FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
        if(!rule)return json({ok:false,error:'定期タスクが見つかりません。'},404);
        const taskId=Number(rule.task_id||0),deleteNow=nowJst();
        const statements:any[]=[...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,id,deleteNow),ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(id,m.family_id)];
        if(taskId){
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

      if(action==='update'){
        const id=Number(b.id||0);if(!id)throw new RecurringBadRequest('対象が不正です。');
        const rule=await ctx.env.DB.prepare('SELECT id,task_id FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
        if(!rule)return json({ok:false,error:'定期タスクが見つかりません。'},404);
        const taskId=Number(rule.task_id||0),title=String(b.title||'').trim(),type=String(b.recurrence_type||'DAILY').trim(),startDate=String(b.start_date||'').trim(),endDate=String(b.end_date||'').trim();
        const allowed=['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY','YEARLY'];
        if(!title||title.length>255)throw new RecurringBadRequest('タイトルを入力してください。');
        if(!allowed.includes(type))throw new RecurringBadRequest('繰り返し種類が不正です。');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw new RecurringBadRequest('開始日が不正です。');
        if(endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate))throw new RecurringBadRequest('終了日が不正です。');
        if(endDate&&endDate<startDate)throw new RecurringBadRequest('終了日は開始日以降にしてください。');
        const interval=Math.max(1,Math.min(365,Number(b.interval_value||1))),weekdays=numberValues(b.weekdays,0,6),monthdays=numberValues(b.monthdays,1,31),weekNumber=Math.max(1,Math.min(5,Number(b.week_number||1))),weekNumbers=numberValues(b.week_numbers,1,5),effectiveWeekNumbers=weekNumbers.length?[...new Set(weekNumbers)]:[weekNumber],businessOrdinal=Math.max(1,Math.min(23,Number(b.business_day_ordinal||1))),completionMode=String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
        const description=String(b.description||'').trim()||null,location=String(b.location||'').trim()||null,startTime=String(b.start_time||'').trim(),endTime=String(b.end_time||'').trim(),allDay=b.all_day?1:0,calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
        const calendarColor=normalizeCalendarColor(b.calendar_color);
        const startAt=allDay||!startTime?`${startDate} 00:00:00`:`${startDate} ${startTime}:00`,endAt=allDay||!endTime?null:`${startDate} ${endTime}:00`;
        if(startAt&&endAt&&endAt<startAt)throw new RecurringBadRequest('終了時刻は開始時刻以降にしてください。');
        const now=nowJst(),assignees=numberValues(b.assignees,1,2147483647);
        const shopping=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):(()=>{const names=stringValues(b['shopping_name[]']),qty=bodyValues(b['shopping_quantity[]']).map(String),urls=bodyValues(b['shopping_url[]']).map(String);return names.slice(0,50).map((name,i)=>({name,quantity:String(qty[i]||'1').trim()||'1',url:String(urls[i]||'').trim(),category:String(b.shopping_category||'').trim()}));})();
        const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):stringValues(b['item_name[]']).slice(0,50);
        for(const v of shopping){const u=String((v as any)?.url||'').trim();if(u){try{const parsed=new URL(u);if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error();}catch{throw new RecurringBadRequest('買い物URLが不正です。');}}}

        if(String(b.edit_scope||'all')==='future'){
          const currentRule=await ctx.env.DB.prepare('SELECT start_date,end_date FROM recurrence_rules WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first<Row>();
          const effectiveDate=String(b.effective_date||'').trim();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))throw new RecurringBadRequest('変更を開始する日が不正です。');
          const currentStart=String(currentRule?.start_date||''),currentEnd=String(currentRule?.end_date||'');
          if(currentStart&&effectiveDate<=currentStart)throw new RecurringBadRequest('開始日から変更する場合は「この定期タスク全体」を選んでください。');
          if(currentEnd&&effectiveDate>currentEnd)throw new RecurringBadRequest('変更開始日は現在の終了日以前にしてください。');
          if(endDate&&endDate<effectiveDate)throw new RecurringBadRequest('終了日は変更開始日以降にしてください。');
          const prevDate=(()=>{const d=new Date(`${effectiveDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)})();
          const futureStartAt=allDay||!startTime?`${effectiveDate} 00:00:00`:`${effectiveDate} ${startTime}:00`,futureEndAt=allDay||!endTime?null:`${effectiveDate} ${endTime}:00`;
          if(futureEndAt&&futureEndAt<futureStartAt)throw new RecurringBadRequest('終了時刻は開始時刻以降にしてください。');
          await ctx.env.DB.batch([
            ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry') AND date(notify_at)>=date(?)").bind(now,m.family_id,taskId,effectiveDate),
            ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', c.occurrence_id, c.member_id, 'COMPLETED', c.completed_at, 'recurrence_split_future', c.occurrence_id, ? FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id WHERE o.family_id=? AND o.recurrence_rule_id=? AND o.occurrence_date>=? AND o.exception_task_id IS NULL AND o.status<>'excluded'").bind(m.family_id,now,m.family_id,id,effectiveDate),
            ctx.env.DB.prepare("DELETE FROM recurrence_occurrence_completions WHERE occurrence_id IN (SELECT id FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded')").bind(m.family_id,id,effectiveDate),
            ctx.env.DB.prepare("DELETE FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded'").bind(m.family_id,id,effectiveDate),
            ctx.env.DB.prepare('UPDATE recurrence_rules SET end_date=?,updated_at=? WHERE id=? AND family_id=?').bind(prevDate,now,id,m.family_id),
          ]);
          const newTask=await ctx.env.DB.prepare(`INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(m.family_id,title,description,futureStartAt,'pending',completionMode,m.id,now,now,futureStartAt,futureEndAt,location,allDay,calendarVisible,calendarColor,'RECURRING',null).run();
          const newTaskId=Number(newTask.meta.last_row_id);
          const newRule=await ctx.env.DB.prepare(`INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,created_at,updated_at,week_number,business_day_ordinal,weekdays_json,monthdays_json,week_numbers_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`).bind(m.family_id,newTaskId,title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,effectiveDate,endDate||null,now,now,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers)).run();
          const newRuleId=Number(newRule.meta.last_row_id);
          await ctx.env.DB.prepare('UPDATE tasks SET recurrence_rule=? WHERE id=? AND family_id=?').bind(JSON.stringify({recurrence_rule_id:newRuleId}),newTaskId,m.family_id).run();
          if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(newTaskId,mid,m.family_id)));
          for(const v of shopping){const o=v as any,name=String(o?.name||'').trim();if(!name)continue;const qty=String(o?.quantity||'1').trim()||'1',url=String(o?.url||'').trim()||null,category=String(o?.category||b.shopping_category||'').trim()||null;const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,effectiveDate,m.id,now,now,newTaskId,url).run();const sid=Number(sr.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
          for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${effectiveDate} 00:00:00`,m.id,now,now,newTaskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();const iid=Number(ir.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}
          await saveTaskFamilyLogTemplate(ctx,newTaskId,b,validatedFamilyLogTemplate);
          await logActivity(ctx,'SPLIT_FUTURE','recurrence_rule',id,{task_id:taskId,new_rule_id:newRuleId,new_task_id:newTaskId,effective_date:effectiveDate});
          return postSuccess({id:newRuleId,task_id:newTaskId,split_from:id,effective_date:effectiveDate});
        }

        await ctx.env.DB.batch([
          ctx.env.DB.prepare(`UPDATE recurrence_rules SET name=?,recurrence_type=?,interval_value=?,weekday=?,monthday=?,start_date=?,end_date=?,week_number=?,business_day_ordinal=?,weekdays_json=?,monthdays_json=?,week_numbers_json=?,updated_at=? WHERE id=? AND family_id=?`).bind(title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers),now,id,m.family_id),
          ctx.env.DB.prepare(`UPDATE tasks SET title=?,description=?,due_at=?,completion_mode=?,updated_at=?,start_at=?,end_at=?,location=?,calendar_visible=?,all_day=?,calendar_color=? WHERE id=? AND family_id=?`).bind(title,description,startAt,completionMode,now,startAt,endAt,location,calendarVisible,allDay,calendarColor,taskId,m.family_id),
          ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE family_id=? AND target_type='task' AND target_id=? AND status IN ('pending','retry')").bind(now,m.family_id,taskId),
        ]);
        await ctx.env.DB.prepare("DELETE FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id=? AND occurrence_date>=? AND exception_task_id IS NULL AND status<>'excluded' AND NOT EXISTS (SELECT 1 FROM recurrence_occurrence_completions c WHERE c.occurrence_id=recurrence_occurrences.id)").bind(m.family_id,id,dateOnly()).run();
        await ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(taskId).run();
        if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(taskId,mid,m.family_id)));
        await ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?)').bind(taskId,taskId).run();
        await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE member_id NOT IN (SELECT member_id FROM task_assignees WHERE task_id=?) AND occurrence_id IN (SELECT o.id FROM recurrence_occurrences o WHERE o.recurrence_rule_id=? AND o.family_id=?)').bind(taskId,id,m.family_id).run();
        await ctx.env.DB.prepare("UPDATE recurrence_occurrences SET status=CASE WHEN (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? )=0 THEN 'pending' WHEN (SELECT COUNT(*) FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=recurrence_occurrences.id) > 0 AND (SELECT completion_mode FROM tasks WHERE id=?) <> 'ALL' THEN 'completed' WHEN (SELECT completion_mode FROM tasks WHERE id=?)='ALL' AND (SELECT COUNT(*) FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=recurrence_occurrences.id) >= (SELECT COUNT(*) FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?) THEN 'completed' ELSE 'pending' END,updated_at=? WHERE recurrence_rule_id=? AND family_id=? AND status<>'excluded'").bind(taskId,taskId,taskId,taskId,taskId,taskId,now,id,m.family_id).run();
        await ctx.env.DB.batch([
          ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id),
          ...archiveTaskChildCompletionStatements(ctx.env.DB,m.family_id,taskId,nowJst()),
          ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id),
          ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(taskId,m.family_id),
          ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(taskId,m.family_id),
        ]);
        for(const v of shopping){const o=v as any,name=String(o?.name||'').trim();if(!name)continue;const qty=String(o?.quantity||'1').trim()||'1',url=String(o?.url||'').trim()||null,category=String(o?.category||b.shopping_category||'').trim()||null;const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,startDate,m.id,now,now,taskId,url).run();const sid=Number(sr.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
        for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${startDate} 00:00:00`,m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();const iid=Number(ir.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}
        await saveTaskFamilyLogTemplate(ctx,taskId,b,validatedFamilyLogTemplate);
        await logActivity(ctx,'UPDATED','recurrence_rule',id,{task_id:taskId});
        return postSuccess({});
      }

      const title=String(b.title||'').trim(),type=String(b.recurrence_type||'DAILY').trim(),startDate=String(b.start_date||'').trim(),endDate=String(b.end_date||'').trim();
      const allowed=['DAILY','INTERVAL_DAYS','WEEKLY','INTERVAL_WEEKS','MONTHLY_DAY','MONTHLY_WEEKDAY','MONTHLY_BUSINESS_DAY','YEARLY'];
      if(!title||title.length>255)throw new RecurringBadRequest('タイトルを入力してください。');
      if(!allowed.includes(type))throw new RecurringBadRequest('繰り返し種類が不正です。');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw new RecurringBadRequest('タイトルと開始日を入力してください。');
      if(endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate))throw new RecurringBadRequest('終了日が不正です。');
      if(endDate&&endDate<startDate)throw new RecurringBadRequest('終了日は開始日以降にしてください。');
      const interval=Math.max(1,Math.min(365,Number(b.interval_value||1))),weekdays=numberValues(b.weekdays,0,6),monthdays=numberValues(b.monthdays,1,31),weekNumber=Math.max(1,Math.min(5,Number(b.week_number||1))),weekNumbers=numberValues(b.week_numbers,1,5),effectiveWeekNumbers=weekNumbers.length?[...new Set(weekNumbers)]:[weekNumber],businessOrdinal=Math.max(1,Math.min(23,Number(b.business_day_ordinal||1))),completionMode=String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
      const description=String(b.description||'').trim()||null,location=String(b.location||'').trim()||null,startTime=String(b.start_time||'').trim(),endTime=String(b.end_time||'').trim(),allDay=b.all_day?1:0,calendarVisible=b.calendar_visible===false||String(b.calendar_visible)==='0'?0:1;
      const calendarColor=normalizeCalendarColor(b.calendar_color);
      const startAt=allDay||!startTime?`${startDate} 00:00:00`:`${startDate} ${startTime}:00`,endAt=allDay||!endTime?null:`${startDate} ${endTime}:00`;
      if(endAt&&endAt<startAt)throw new RecurringBadRequest('終了時刻は開始時刻以降にしてください。');
      const now=nowJst();
      const taskR=await ctx.env.DB.prepare(`INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(m.family_id,title,description,startAt,'pending',completionMode,m.id,now,now,startAt,endAt,location,allDay,calendarVisible,calendarColor,'RECURRING',null).run();
      const taskId=Number(taskR.meta.last_row_id);
      const ruleR=await ctx.env.DB.prepare(`INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,created_at,updated_at,week_number,business_day_ordinal,weekdays_json,monthdays_json,week_numbers_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`).bind(m.family_id,taskId,title,type,interval,weekdays.length?weekdays[0]:null,monthdays.length?monthdays[0]:null,startDate,endDate||null,now,now,type==='MONTHLY_WEEKDAY'?weekNumber:null,type==='MONTHLY_BUSINESS_DAY'?businessOrdinal:null,JSON.stringify(weekdays),JSON.stringify(monthdays),JSON.stringify(effectiveWeekNumbers)).run();
      const ruleId=Number(ruleR.meta.last_row_id);
      await ctx.env.DB.prepare('UPDATE tasks SET recurrence_rule=? WHERE id=? AND family_id=?').bind(JSON.stringify({recurrence_rule_id:ruleId}),taskId,m.family_id).run();
      const assignees=numberValues(b.assignees,1,2147483647);
      if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(taskId,mid,m.family_id)));
      const shopping=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):(()=>{const names=stringValues(b['shopping_name[]']),qty=bodyValues(b['shopping_quantity[]']).map(String),urls=bodyValues(b['shopping_url[]']).map(String);return names.slice(0,50).map((name,i)=>({name,quantity:String(qty[i]||'1').trim()||'1',url:String(urls[i]||'').trim(),category:String(b.shopping_category||'').trim()}));})();
      for(const v of shopping){const o=v as any,name=String(o?.name||'').trim();if(!name)continue;const qty=String(o?.quantity||'1').trim()||'1',url=String(o?.url||'').trim()||null,category=String(o?.category||b.shopping_category||'').trim()||null;const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,startDate,m.id,now,now,taskId,url).run();const sid=Number(sr.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
      const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):stringValues(b['item_name[]']).slice(0,50);
      for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,`${startDate} 00:00:00`,m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();const iid=Number(ir.meta.last_row_id);if(assignees.length)await ctx.env.DB.batch(assignees.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}
      await saveTaskFamilyLogTemplate(ctx,taskId,b,validatedFamilyLogTemplate);
      await logActivity(ctx,'CREATED','recurrence_rule',ruleId,{task_id:taskId});
      return postSuccess({id:ruleId,task_id:taskId});
    }

    await ensureFamilyLogMemberSubjects(ctx,m.family_id,m.id);
    const recurringLogSubjects=await ctx.env.DB.prepare('SELECT id,name,subject_kind FROM family_log_subjects WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
    const rows=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id,(SELECT GROUP_CONCAT(ta.member_id,',') FROM task_assignees ta WHERE ta.task_id=t.id) assignee_ids FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? ORDER BY r.active DESC,r.id DESC`).bind(m.family_id).all<Row>();
    const recurringTemplates=await ctx.env.DB.prepare('SELECT * FROM task_family_log_templates WHERE family_id=? AND active=1').bind(m.family_id).all<Row>(),templateByTask=new Map(recurringTemplates.results.map(x=>[Number(x.task_id),x]));
    const recurringChildren=await Promise.all(rows.results.map(async r=>{const [shops,items]=await Promise.all([ctx.env.DB.prepare('SELECT name,quantity,category,url FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(r.task_id),m.family_id).all<Row>(),ctx.env.DB.prepare('SELECT name FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(r.task_id),m.family_id).all<Row>()]);return {shopping:shops.results.map(x=>({name:String(x.name||''),quantity:String(x.quantity||'1'),category:String(x.category||''),url:String(x.url||'')})),items:items.results.map(x=>String(x.name||''))};}));
    const splitLogs=await ctx.env.DB.prepare("SELECT target_id,metadata FROM activity_logs WHERE family_id=? AND action='SPLIT_FUTURE' AND target_type='recurrence_rule' ORDER BY occurred_at,id").bind(m.family_id).all<Row>();
    const parentByRule=new Map<number,number>(),childByRule=new Map<number,number>();
    for(const log of splitLogs.results){try{const meta=JSON.parse(String(log.metadata||'{}')),oldId=Number(log.target_id||0),newId=Number(meta.new_rule_id||0);if(oldId&&newId){childByRule.set(oldId,newId);parentByRule.set(newId,oldId);}}catch{}}
    const titleByRule=new Map(rows.results.map(r=>[Number(r.id),String(r.title||r.name||'定期タスク')]));
    const excludedRaw=await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,o.status,r.*,t.title FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE o.family_id=? AND o.status='excluded' AND r.start_date<=o.occurrence_date AND (r.end_date IS NULL OR r.end_date>=o.occurrence_date) ORDER BY o.occurrence_date DESC,o.id DESC LIMIT 100`).bind(m.family_id).all<Row>();
    const excludedRows=excludedRaw.results.filter(x=>matchesRecurrence(x,String(x.occurrence_date||''))),csrf=esc(ctx.session.csrfToken||'');
    const ruleJson=rows.results.map((r,ri)=>JSON.stringify({id:Number(r.id),title:String(r.title||r.name||''),description:String(r.description||''),recurrence_type:String(r.recurrence_type||'DAILY'),interval_value:Number(r.interval_value||1),start_date:String(r.start_date||''),end_date:String(r.end_date||''),weekdays:parseJsonArray(r.weekdays_json),monthdays:parseJsonArray(r.monthdays_json),week_numbers:parseJsonArray(r.week_numbers_json),week_number:Number(r.week_number||1),business_day_ordinal:Number(r.business_day_ordinal||1),completion_mode:String(r.completion_mode||'ANY'),location:String(r.location||''),calendar_color:String(r.calendar_color||'#7c3aed'),assignees:String(r.assignee_ids||'').split(',').filter(Boolean).map(Number),all_day:Number(r.all_day??1)===1,calendar_visible:Number(r.calendar_visible??1)===1,start_time:String(r.start_at||'').slice(11,16),end_time:String(r.end_at||'').slice(11,16),family_log_template:templateByTask.get(Number(r.task_id))||null,shopping:recurringChildren[ri]?.shopping||[],items:recurringChildren[ri]?.items||[]})).map(x=>x.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
    const rowsHtml=rows.results.map((r,i)=>{const rid=Number(r.id),parent=parentByRule.get(rid),child=childByRule.get(rid),lineage=[parent?`<span class="rec-lineage-badge">← 分割元: ${esc(titleByRule.get(parent)||'#'+parent)}</span>`:'',child?`<span class="rec-lineage-badge">次シリーズ: ${esc(titleByRule.get(child)||'#'+child)} →</span>`:''].filter(Boolean).join('');return `<div class="row rec-rule-row"><strong>${esc(r.title)}</strong><div class="meta">${esc(r.recurrence_type)} / ${esc(r.interval_value)} ・ ${esc(r.start_date)}${r.end_date?' ～ '+esc(r.end_date):''} ・ ${Number(r.active)?'有効':'停止'}</div>${lineage?`<div class="rec-lineage">${lineage}</div>`:''}<div class="rec-row-actions"><button type="button" class="btn gray rec-edit" data-rule="${ruleJson[i]}">編集</button><form method="post" action="/app/recurring.php" class="rec-inline-form rec-toggle-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="active" value="${Number(r.active)?0:1}"><button type="submit" class="btn gray rec-toggle" data-id="${r.id}" data-active="${Number(r.active)?1:0}">${Number(r.active)?'停止':'再開'}</button></form><form method="post" action="/app/recurring.php" class="rec-inline-form rec-delete-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn danger rec-delete" data-id="${r.id}">削除</button></form></div></div>`;}).join('');
    const excludedHtml=excludedRows.map(x=>`<div class="row rec-excluded-row"><div><strong>${esc(x.title||x.name||'定期タスク')}</strong><div class="meta">${esc(String(x.occurrence_date||''))} ・ この日だけ除外</div></div><form method="post" action="/app/recurring.php" class="rec-inline-form"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="restore_excluded"><input type="hidden" name="occurrence_id" value="${x.occurrence_id}"><button type="submit" class="btn gray small">復活する</button></form></div>`).join('');
    const editRaw=new URL(request.url).searchParams.get('edit')||'',editId=/^[1-9]\d{0,9}$/.test(editRaw)?Number(editRaw):0,ownedEdit=editId&&rows.results.some(r=>Number(r.id)===editId)?editId:0,occurrenceRaw=new URL(request.url).searchParams.get('occurrence')||'',occurrenceId=/^[1-9]\d{0,9}$/.test(occurrenceRaw)?Number(occurrenceRaw):0,occurrenceDate=String(new URL(request.url).searchParams.get('date')||'');
    const recurringConfig=JSON.stringify({csrf:ctx.session.csrfToken||'',today:dateOnly(),autoEditRuleId:ownedEdit,occurrenceId,occurrenceDate:/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)?occurrenceDate:''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
    const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
    const resultNotice=(()=>{const result=new URL(request.url).searchParams.get('result');return result==='deleted'?'<div class="notice success">定期タスクを削除しました。</div>':result==='toggled'?'<div class="notice success">定期タスクの状態を更新しました。</div>':result==='saved'?'<div class="notice success">定期タスクを保存しました。</div>':result==='restored'?'<div class="notice success">除外していた発生日を復活しました。</div>':''})();
    const body=`<div class="page-head"><h1>🔁 定期タスク</h1><a class="btn" href="/app/settings.php">管理へ戻る</a></div>
    <div class="card"><h2 id="recHeading">定期タスクを作成</h2>${resultNotice}<form id="recForm" method="post" action="/app/recurring.php" novalidate><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="action" value="create"><input type="hidden" name="id" value=""><div id="recEditScope" class="rec-edit-scope" style="display:none"><label>変更範囲</label><select name="edit_scope" id="recEditScopeSelect"><option value="all">この定期タスク全体</option><option value="future">指定日以降だけ変更</option></select><div id="recEffectiveDateWrap" style="display:none"><label>変更を開始する日</label><input type="date" name="effective_date" value="${dateOnly()}"><p class="small">この日より前の履歴・発生日は現在の定期タスクに残します。</p></div></div><label>タイトル</label><input name="title" maxlength="255" required><label>説明</label><textarea name="description"></textarea><label>種類</label><select name="recurrence_type"><option value="DAILY">毎日</option><option value="INTERVAL_DAYS">n日ごと</option><option value="WEEKLY">毎週</option><option value="INTERVAL_WEEKS">n週ごと</option><option value="MONTHLY_DAY">毎月指定日</option><option value="MONTHLY_WEEKDAY">毎月第n曜日</option><option value="MONTHLY_BUSINESS_DAY">毎月第n営業日</option><option value="YEARLY">毎年</option></select><div class="rec-conditional" data-rec-show="INTERVAL_DAYS,INTERVAL_WEEKS" style="display:none"><label>間隔</label><input type="number" name="interval_value" value="1" min="1" max="365"><p class="small">「n日ごと」「n週ごと」のときだけ使用します。</p></div><label>開始日</label><input type="date" name="start_date" value="${dateOnly()}" required><label>終了日（任意）</label><input type="date" name="end_date"><div class="rec-conditional" data-rec-show="WEEKLY,INTERVAL_WEEKS,MONTHLY_WEEKDAY" style="display:none"><label>曜日</label><div>${['日','月','火','水','木','金','土'].map((x,i)=>`<label style="display:inline-block;margin-right:10px"><input type="checkbox" name="weekdays" value="${i}">${x}</label>`).join('')}</div></div><div class="rec-conditional" data-rec-show="MONTHLY_WEEKDAY" style="display:none"><label>第n曜日（複数選択可）</label><div class="nth-week-list">${[1,2,3,4,5].map(n=>`<label class="checkrow inline-check"><input type="checkbox" name="week_numbers" value="${n}">第${n}</label>`).join('')}</div></div><div class="rec-conditional" data-rec-show="MONTHLY_DAY" style="display:none"><label>毎月指定日</label><input name="monthdays" placeholder="1,15,25"></div><div class="rec-conditional" data-rec-show="MONTHLY_BUSINESS_DAY" style="display:none"><label>第n営業日</label><input type="number" name="business_day_ordinal" value="1" min="1" max="23"></div><label class="checkrow"><input type="checkbox" name="all_day" checked> 終日</label><div class="rec-time-fields compact-time-fields" style="display:none"><div><label>開始時刻</label><input type="time" name="start_time"></div><div><label>終了時刻</label><input type="time" name="end_time"></div></div><label>場所</label><input name="location"><label>担当者</label><div class="assignee-list">${members.results.map(x=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div><label><input type="checkbox" name="calendar_visible" checked> カレンダーに表示</label><div id="recCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color">${CALENDAR_COLOR_OPTIONS.map(option=>`<option value="${option.value}">${option.label}</option>`).join('')}</select><label class="small" for="recCalendarColorCustom">カスタム色</label><input id="recCalendarColorCustom" type="color" value="#7c3aed" aria-label="定期タスクのカスタム色"></div><div class="sub-card"><button type="button" class="section-button" id="recShopToggle">＋ この定期タスクに買い物を追加</button><div id="recShopBox" style="display:none"><label>カテゴリー</label><input name="shopping_category" placeholder="例：食品"><div id="recShopRows"><div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div></div><button type="button" class="btn gray small" id="recAddShop">＋ 商品を追加</button></div></div><div class="sub-card"><button type="button" class="section-button" id="recItemToggle">＋ この定期タスクに持ち物を追加</button><div id="recItemBox" style="display:none"><div id="recItemRows"><div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div></div><button type="button" class="btn gray small" id="recAddItem">＋ 持ち物を追加</button></div></div><details class="sub-card family-log-template"><summary>🐣 家族ログ連携（任意）</summary><label class="checkrow"><input type="checkbox" name="family_log_enabled"> 記録して完了を有効にする</label><div id="recFamilyLogFields" style="display:none"><label>記録対象</label><select name="family_log_subject_id"><option value="">選択してください</option>${recurringLogSubjects.results.map(x=>`<option value="${x.id}">${esc(familyLogSubjectIcon(x))} ${esc(x.name)}</option>`).join('')}</select><label>記録種類</label><select name="family_log_type">${FAMILY_LOG_TYPES.map(type=>`<option value="${type}">${FAMILY_LOG_TYPE_META[type].icon} ${FAMILY_LOG_TYPE_META[type].label}</option>`).join('')}</select><label>詳細</label><select name="family_log_detail_code"><option value="">指定なし</option>${Object.entries(FAMILY_LOG_DETAILS).map(([code,label])=>`<option value="${code}">${esc(label)}</option>`).join('')}</select><label>数値</label><input type="number" step="any" name="family_log_amount"><label>単位</label><input name="family_log_unit" maxlength="40"><label>時間（分）</label><input type="number" name="family_log_duration_minutes" min="0" max="10080"><label>テキスト</label><input name="family_log_value_text" maxlength="255"><label>メモ</label><textarea name="family_log_note" maxlength="2000"></textarea><p class="small">HOUSEWORKは家族共通（対象なし）として保存します。ログを削除してもタスク完了は取り消されません。</p></div></details><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">全員が完了</option></select><div id="recStatus" class="small rec-status" aria-live="polite">登録機能を準備しています…</div><noscript><p class="small">JavaScriptが無効でも通常送信で登録できます。</p></noscript><div style="display:flex;gap:8px"><button type="submit" id="recSubmit">定期タスクを作成</button><button type="button" id="recCancel" class="btn gray" style="display:none">編集をキャンセル</button></div></form></div>
    <div class="card"><h2>登録済み</h2>${rowsHtml||'<p>ありません。</p>'}</div>${excludedHtml?`<div class="card"><h2>除外した発生日</h2><p class="small">「この日だけ除外」の日を後から定期予定へ戻せます。</p>${excludedHtml}</div>`:''}<script type="application/json" id="recurringConfig">${recurringConfig}</script><script src="/assets/recurring.js?v=${APP_VERSION}"></script>`;
    return html(layout('定期タスク',body,'/app/settings.php'));
  }catch(error){
    if(error instanceof RecurringForbidden)return json({ok:false,error:error.message||'CSRF検証に失敗しました。'},403);
    if(error instanceof RecurringBadRequest||error instanceof RequestBodyParseError||error instanceof TaskFamilyLogTemplateInputError)return json({ok:false,error:error.message||'入力内容が不正です。'},400);
    throw error;
  }
}
