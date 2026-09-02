import type { AppContext } from './app-context';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

export const FAMILY_LOG_TYPES=Object.keys(FAMILY_LOG_TYPE_META);
const FAMILY_LOG_SUBJECT_TYPES=FAMILY_LOG_TYPES.filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
export const FAMILY_LOG_DETAILS:Record<string,string>={LEFT:'左',RIGHT:'右',BOTH:'両方',BREAKFAST:'朝食',LUNCH:'昼食',DINNER:'夕食',SNACK:'おやつ',OTHER:'その他',BABY_FOOD:'離乳食',WET:'おしっこ',DIRTY:'うんち',BATH:'お風呂',SHOWER:'シャワー',VOMIT:'吐いた',GOOD:'良好',NORMAL:'ふつう',TIRED:'疲れ気味',SICK:'不調',WALK:'歩く',RUN:'走る',STRENGTH:'筋トレ',STRETCH:'ストレッチ',PLAY:'遊び'};
const FAMILY_LOG_SUBJECT_META:Record<string,{icon:string;label:string}>={BABY:{icon:'👶',label:'赤ちゃん'},CHILD:{icon:'🧒',label:'子ども'},ADULT:{icon:'👤',label:'大人'},PET:{icon:'🐾',label:'ペット'},OTHER:{icon:'⭐',label:'その他'}};
const FAMILY_LOG_DEFAULT_TYPES:Record<string,string[]>={
  BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
  CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
  ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
  PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
  OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT'],
};

function familyLogSubjectKind(value:unknown):string{
  const kind=String(value||'ADULT').toUpperCase();
  return Object.prototype.hasOwnProperty.call(FAMILY_LOG_SUBJECT_META,kind)?kind:'OTHER';
}
function familyLogDefaultTypes(kind:unknown):string[]{return [...(FAMILY_LOG_DEFAULT_TYPES[familyLogSubjectKind(kind)]||FAMILY_LOG_DEFAULT_TYPES.OTHER)];}
function familyLogEnabledTypes(subject:Row|undefined|null):string[]{
  if(!subject)return [...FAMILY_LOG_TYPES];
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed)){const out=[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))];if(out.length)return out;}}catch{}}
  return familyLogDefaultTypes(subject.subject_kind);
}
export function familyLogSubjectIcon(subject:Row|undefined|null):string{
  if(subject?.icon)return String(subject.icon);
  return FAMILY_LOG_SUBJECT_META[familyLogSubjectKind(subject?.subject_kind)]?.icon||'👤';
}

export async function ensureFamilyLogMemberSubjects(ctx:AppContext,familyId:number,createdBy:number):Promise<void>{
  const now=nowJst();
  await ctx.env.DB.prepare(`INSERT INTO family_log_subjects(family_id,member_id,name,subject_kind,birth_date,icon,active,created_by,created_at,updated_at,enabled_types_json,auto_complete_linked_task)
    SELECT mm.family_id,mm.id,mm.name,CASE WHEN upper(COALESCE(mm.member_type,'ADULT'))='BABY' THEN 'BABY' WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('CHILD','KID') THEN 'CHILD' ELSE 'ADULT' END,NULL,mm.icon,1,?,COALESCE(mm.created_at,?),?,NULL,CASE WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('BABY','CHILD','KID') THEN 1 ELSE 0 END FROM members mm WHERE mm.family_id=? AND mm.active=1 AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.family_id=mm.family_id AND s.member_id=mm.id)`)
    .bind(createdBy,now,now,familyId).run();
}

export class TaskFamilyLogTemplateInputError extends Error {}
export type ValidatedTaskFamilyLogTemplate={enabled:boolean;values:unknown[]};

export async function validateTaskFamilyLogTemplateInput(ctx:AppContext,b:Record<string,unknown>):Promise<ValidatedTaskFamilyLogTemplate>{
  const m=ctx.member;if(!m)throw new TaskFamilyLogTemplateInputError('認証が必要です。');
  const value=b.family_log_enabled;
  const enabled=value===undefined||value===null||value===''?false:typeof value==='boolean'?value:['1','true','on','yes'].includes(String(value).toLowerCase());
  if(!enabled)return {enabled:false,values:[]};
  const logType=String(b.family_log_type||'').toUpperCase();if(!FAMILY_LOG_TYPES.includes(logType))throw new TaskFamilyLogTemplateInputError('家族ログの記録種類が不正です。');
  let subjectId=Number(b.family_log_subject_id||0)||null;
  if(logType==='HOUSEWORK')subjectId=null;
  if(subjectId){const subject=await ctx.env.DB.prepare('SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(subjectId,m.family_id).first<Row>();if(!subject||!familyLogEnabledTypes(subject).includes(logType))throw new TaskFamilyLogTemplateInputError('家族ログの対象または記録種類を利用できません。');}
  else if(logType!=='HOUSEWORK')throw new TaskFamilyLogTemplateInputError('家族ログの記録対象を選択してください。');
  return {enabled:true,values:[subjectId,logType,String(b.family_log_detail_code||'').trim()||null,Number.isFinite(Number(b.family_log_amount))&&String(b.family_log_amount??'')!==''?Number(b.family_log_amount):null,String(b.family_log_unit||'').trim().slice(0,40)||null,Number.isInteger(Number(b.family_log_duration_minutes))&&String(b.family_log_duration_minutes??'')!==''?Math.max(0,Math.min(10080,Number(b.family_log_duration_minutes))):null,String(b.family_log_value_text||'').trim().slice(0,255)||null,String(b.family_log_note||'').trim().slice(0,2000)||null]};
}

export async function saveTaskFamilyLogTemplate(ctx:AppContext,taskId:number,b:Record<string,unknown>,validated?:ValidatedTaskFamilyLogTemplate):Promise<void>{
  const m=ctx.member;if(!m)throw new TaskFamilyLogTemplateInputError('認証が必要です。');
  const parsed=validated??await validateTaskFamilyLogTemplateInput(ctx,b),enabled=parsed.enabled,now=nowJst();
  const current=await ctx.env.DB.prepare('SELECT id FROM task_family_log_templates WHERE task_id=? AND family_id=? AND active=1 LIMIT 1').bind(taskId,m.family_id).first<Row>();
  if(!enabled){if(current)await ctx.env.DB.prepare('UPDATE task_family_log_templates SET active=0,updated_at=? WHERE id=? AND family_id=?').bind(now,Number(current.id),m.family_id).run();return;}
  const values=parsed.values;
  if(current)await ctx.env.DB.prepare('UPDATE task_family_log_templates SET subject_id=?,log_type=?,detail_code=?,amount=?,unit=?,duration_minutes=?,value_text=?,note=?,updated_at=? WHERE id=? AND family_id=?').bind(...values,now,Number(current.id),m.family_id).run();
  else await ctx.env.DB.prepare('INSERT INTO task_family_log_templates(family_id,task_id,subject_id,log_type,detail_code,amount,unit,duration_minutes,value_text,note,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,?)').bind(m.family_id,taskId,...values,m.id,now,now).run();
}
