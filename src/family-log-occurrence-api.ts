import type { AppContext } from './app-context';
import { completeLinkedTargetFromFamilyLog } from './family-log-linked-completion';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row=Record<string,unknown>;

const FAMILY_LOG_TYPES=[
  'MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE',
  'CONDITION','WEIGHT','HEIGHT','BLOOD_PRESSURE','EXERCISE','WATER','TOILET','WALK','TIMER','HOUSEWORK','MEMO',
] as const;
const FAMILY_LOG_SUBJECT_TYPES=FAMILY_LOG_TYPES.filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
const FAMILY_LOG_DEFAULT_TYPES:Record<string,string[]>={
  BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
  CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
  ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
  PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
  OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT'],
};

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);

function badRequest(message:string):Response{
  return json({ok:false,error:message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
}
function forbidden(message:string):Response{
  return json({ok:false,error:message||'この操作は許可されていません。',code:'FORBIDDEN'},403);
}
function familyLogSubjectKind(value:unknown):string{
  const kind=String(value||'ADULT').toUpperCase();
  return Object.prototype.hasOwnProperty.call(FAMILY_LOG_DEFAULT_TYPES,kind)?kind:'OTHER';
}
function familyLogEnabledTypes(subject:Row|undefined|null):string[]{
  if(!subject)return [...FAMILY_LOG_TYPES];
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed)){
        const out=[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x as typeof FAMILY_LOG_SUBJECT_TYPES[number])))];
        if(out.length)return out;
      }
    }catch{}
  }
  return [...(FAMILY_LOG_DEFAULT_TYPES[familyLogSubjectKind(subject.subject_kind)]||FAMILY_LOG_DEFAULT_TYPES.OTHER)];
}

/** Active owner for POST /api/recurrence/family-log-complete. */
export async function recordOccurrenceFamilyLog(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method!=='POST')return badRequest('POSTを使用してください。');

  let b:Record<string,unknown>;
  try{
    b=await bodyJson(request);
  }catch(error){
    if(error instanceof RequestBodyParseError)return badRequest(error.message);
    throw error;
  }

  ctx.session.csrfToken??=crypto.randomUUID();
  if(typeof b.csrf!=='string'||b.csrf!==ctx.session.csrfToken)return forbidden('CSRF検証に失敗しました。');
  const occurrenceId=Number(b.occurrence_id||0);
  if(!occurrenceId)return badRequest('発生日が不正です。');

  const row=await ctx.env.DB.prepare(`SELECT o.id,o.occurrence_date,o.status,r.task_id,t.task_kind,ft.id template_id,ft.subject_id,ft.log_type,ft.detail_code,ft.amount,ft.unit,ft.duration_minutes,ft.value_text,ft.note
    FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=o.family_id JOIN task_family_log_templates ft ON ft.task_id=t.id AND ft.family_id=o.family_id AND ft.active=1
    WHERE o.id=? AND o.family_id=? AND o.status<>'excluded' LIMIT 1`).bind(occurrenceId,m.family_id).first<Row>();
  if(!row||String(row.task_kind||'').toUpperCase()==='EVENT')return json({ok:false,error:'家族ログ連携された定期タスク発生日が見つかりません。'},404);

  if(row.subject_id){
    const subject=await ctx.env.DB.prepare('SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(Number(row.subject_id),m.family_id).first<Row>();
    if(!subject||!familyLogEnabledTypes(subject).includes(String(row.log_type)))return badRequest('設定された家族ログ対象は現在利用できません。');
  }

  const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members mm ON mm.id=ta.member_id AND mm.active=1 WHERE ta.task_id=?').bind(Number(row.task_id)).first<Row>();
  const actorAssigned=Number(assigned?.c||0)===0||Boolean(await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees WHERE task_id=? AND member_id=? LIMIT 1').bind(Number(row.task_id),m.id).first<Row>());
  if(!actorAssigned)return json({ok:false,error:'記録者がこの定期タスクの担当者ではありません。'},409);

  const existing=await ctx.env.DB.prepare('SELECT id FROM family_logs WHERE task_family_log_template_id=? AND linked_occurrence_id=? AND created_by=? AND deleted_at IS NULL LIMIT 1').bind(Number(row.template_id),occurrenceId,m.id).first<Row>();
  let logId=Number(existing?.id||0),created=false;
  if(!logId){
    const now=nowJst(),today=dateOnly(),occurredAt=String(row.occurrence_date)===today?now:`${row.occurrence_date} 12:00:00`;
    const ins=await ctx.env.DB.prepare('INSERT OR IGNORE INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(m.family_id,row.subject_id||null,row.log_type,occurredAt,row.detail_code||null,row.amount??null,row.unit||null,row.duration_minutes??null,row.value_text||null,row.note||null,occurrenceId,m.id,now,now,Number(row.template_id)).run();
    logId=Number(ins.meta.last_row_id||0);
    created=logId>0;
    if(!logId){
      const raced=await ctx.env.DB.prepare('SELECT id FROM family_logs WHERE task_family_log_template_id=? AND linked_occurrence_id=? AND created_by=? AND deleted_at IS NULL LIMIT 1').bind(Number(row.template_id),occurrenceId,m.id).first<Row>();
      logId=Number(raced?.id||0);
    }
  }

  if(!logId)return badRequest('家族ログを保存できませんでした。');
  const completion=await completeLinkedTargetFromFamilyLog(ctx,null,occurrenceId,logId);
  if(!completion.ok){
    if(created)await ctx.env.DB.prepare('UPDATE family_logs SET deleted_at=?,updated_at=? WHERE id=? AND family_id=?').bind(nowJst(),nowJst(),logId,m.family_id).run();
    return json({ok:false,error:completion.message},409);
  }
  return json({ok:true,id:logId,already:!created,status:completion.status,message:completion.message});
}
