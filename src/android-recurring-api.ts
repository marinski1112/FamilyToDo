import type {AppContext} from './app-context';
import {recurring} from './recurring-page';
import {matchesRecurrence} from './recurrence-projection';
import {json} from './response';

const headers={'cache-control':'private, no-store'};

/** Native read model and JSON transport for the canonical recurring-task mutations. */
export async function androidRecurringApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const role=String(member.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,code:'FORBIDDEN'},403,headers);
  if(request.method==='POST')return recurring(request,ctx);
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{...headers,allow:'GET, POST'});
  const raw=new URL(request.url).searchParams.get('id')||'';
  if(raw&&!/^[1-9]\d*$/.test(raw))return json({ok:false,code:'INVALID_ID'},400,headers);
  const id=raw?Number(raw):0;
  if(!Number.isSafeInteger(id))return json({ok:false,code:'INVALID_ID'},400,headers);
  const result=await ctx.env.DB.prepare(`SELECT r.id,r.task_id,r.name,r.recurrence_type,r.interval_value,r.start_date,r.end_date,
      r.active,r.weekdays_json,r.monthdays_json,r.week_numbers_json,r.week_number,r.business_day_ordinal,
      t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_color,
      ft.subject_id family_log_subject_id,ft.log_type family_log_type,ft.detail_code family_log_detail_code,
      ft.amount family_log_amount,ft.unit family_log_unit,ft.duration_minutes family_log_duration_minutes,
      ft.value_text family_log_value_text,ft.note family_log_note
    FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
    LEFT JOIN task_family_log_templates ft ON ft.task_id=t.id AND ft.family_id=r.family_id AND ft.active=1
    WHERE r.family_id=? AND (?=0 OR r.id=?) ORDER BY r.active DESC,r.id DESC LIMIT ?`)
    .bind(member.family_id,id,id,id?1:101).all();
  const subjects=await ctx.env.DB.prepare(`SELECT id,name,subject_kind,enabled_types_json FROM family_log_subjects
    WHERE family_id=? AND active=1 ORDER BY id LIMIT 100`).bind(member.family_id).all();
  const excluded=id?[]:(await ctx.env.DB.prepare(`SELECT o.id occurrence_id,o.occurrence_date,r.*,t.title
    FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id
    JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
    WHERE o.family_id=? AND o.status='excluded' AND r.start_date<=o.occurrence_date
      AND (r.end_date IS NULL OR r.end_date>=o.occurrence_date)
    ORDER BY o.occurrence_date DESC,o.id DESC LIMIT 100`).bind(member.family_id).all()).results
    .filter(row=>matchesRecurrence(row,String(row.occurrence_date||'')))
    .map(row=>({occurrence_id:row.occurrence_id,occurrence_date:row.occurrence_date,title:row.title}));
  return json({ok:true,rules:result.results.slice(0,100),subjects:subjects.results,
    excluded,truncated:!id&&result.results.length>100},200,headers);
}
