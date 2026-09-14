import type { AppContext } from './app-context';
import { logActivity } from './activity-log';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date());

function breastfeedEnabled(subject:Row):boolean{
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      return Array.isArray(parsed)&&parsed.map(value=>String(value||'').toUpperCase()).includes('BREASTFEED');
    }catch{return false;}
  }
  return String(subject.subject_kind||'').toUpperCase()==='BABY';
}

function authFailure(){return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);}

/** Dedicated Family Log timer used only by the BREASTFEED quick action. */
export async function familyLogBreastfeedTimerApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return authFailure();

  if(request.method==='GET'){
    const rows=await ctx.env.DB.prepare(`SELECT id,subject_id,started_at,started_at_ms
      FROM family_log_timers
      WHERE family_id=? AND log_type='BREASTFEED' AND status='running'
      ORDER BY started_at_ms,id`).bind(member.family_id).all<Row>();
    return json({ok:true,timers:rows.results.map(row=>({
      id:Number(row.id),subject_id:Number(row.subject_id||0),started_at:String(row.started_at||''),started_at_ms:Number(row.started_at_ms||0),
    }))});
  }
  if(request.method!=='POST')return json({ok:false,error:'GET or POST only'},405);

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){
    if(error instanceof RequestBodyParseError)return json({ok:false,error:error.message||'入力内容が不正です。'},400);
    throw error;
  }
  const csrf=String(body.csrf||''),expected=String(ctx.session.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return json({ok:false,error:'CSRF検証に失敗しました。'},403);

  const subjectId=Number(body.subject_id||0);
  if(!Number.isSafeInteger(subjectId)||subjectId<=0)return json({ok:false,error:'記録対象を選択してください。'},400);
  const subject=await ctx.env.DB.prepare('SELECT id,name,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1')
    .bind(subjectId,member.family_id).first<Row>();
  if(!subject)return json({ok:false,error:'記録対象が見つかりません。'},404);
  if(!breastfeedEnabled(subject))return json({ok:false,error:'この対象では母乳記録を利用できません。'},400);

  const running=await ctx.env.DB.prepare("SELECT id,started_at,started_at_ms,note FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='BREASTFEED' AND status='running' ORDER BY id DESC LIMIT 1")
    .bind(member.family_id,subjectId).first<Row>();
  const now=nowJst();

  if(!running){
    const inserted=await ctx.env.DB.prepare("INSERT INTO family_log_timers(family_id,subject_id,log_type,started_at,started_at_ms,status,note,created_by,created_at,updated_at,timer_label) VALUES(?,?, 'BREASTFEED',?,?,'running',NULL,?,?,?,'母乳')")
      .bind(member.family_id,subjectId,now,Date.now(),member.id,now,now).run();
    const timerId=Number(inserted.meta.last_row_id||0);
    await logActivity(ctx,'STARTED','family_log_timer',timerId,{log_type:'BREASTFEED',subject_id:subjectId});
    return json({ok:true,state:'started',timer_id:timerId,started_at:now});
  }

  const timerId=Number(running.id||0),startedAt=String(running.started_at||now);
  const startedMs=Number(running.started_at_ms||Date.now());
  const duration=Math.max(0,Math.min(10080,Math.round((Date.now()-startedMs)/60000)));
  const results=await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?, 'BREASTFEED',?,NULL,NULL,NULL,?,NULL,?,NULL,NULL,?,?,?,NULL)")
      .bind(member.family_id,subjectId,startedAt,duration,running.note||null,member.id,now,now),
    ctx.env.DB.prepare("UPDATE family_log_timers SET status='stopped',updated_at=? WHERE id=? AND family_id=? AND status='running'")
      .bind(now,timerId,member.family_id),
  ]);
  const logId=Number(results[0]?.meta.last_row_id||0);
  await logActivity(ctx,'CREATED','family_log',logId,{log_type:'BREASTFEED',occurred_at:startedAt,subject_id:subjectId,subject_name:String(subject.name||''),duration_minutes:duration,source:'timer'});
  await logActivity(ctx,'STOPPED','family_log_timer',timerId,{family_log_id:logId,duration_minutes:duration});
  return json({ok:true,state:'stopped',timer_id:timerId,log_id:logId,duration_minutes:duration});
}
