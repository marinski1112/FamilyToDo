import type { AppContext } from './app-context';
import type { CurrentMember } from './types';
import { logActivity } from './activity-log';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { taskVisibilitySql } from './task-visibility';
import { FamilyLogBadRequest } from './family-log-errors';

type Row=Record<string,unknown>;

export const FAMILY_LOG_TYPES=Object.keys(FAMILY_LOG_TYPE_META);
export const FAMILY_LOG_SUBJECT_TYPES=FAMILY_LOG_TYPES.filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
export const FAMILY_LOG_DETAILS:Record<string,string>={
  LEFT:'左',RIGHT:'右',BOTH:'両方',BREAKFAST:'朝食',LUNCH:'昼食',DINNER:'夕食',SNACK:'おやつ',OTHER:'その他',BABY_FOOD:'離乳食',WET:'おしっこ',DIRTY:'うんち',BATH:'お風呂',SHOWER:'シャワー',VOMIT:'吐いた',
  GOOD:'良好',NORMAL:'ふつう',TIRED:'疲れ気味',SICK:'不調',WALK:'歩く',RUN:'走る',STRENGTH:'筋トレ',STRETCH:'ストレッチ',PLAY:'遊び'
};
export const FAMILY_LOG_SUBJECT_META:Record<string,{icon:string;label:string}>={
  BABY:{icon:'👶',label:'赤ちゃん'},CHILD:{icon:'🧒',label:'子ども'},ADULT:{icon:'👤',label:'大人'},PET:{icon:'🐾',label:'ペット'},OTHER:{icon:'⭐',label:'その他'}
};
const FAMILY_LOG_DEFAULT_TYPES:Record<string,string[]>={
  BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
  CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
  ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
  PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
  OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT']
};

export const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
export const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

export function familyLogSubjectKind(value:unknown):string{
  const kind=String(value||'ADULT').toUpperCase();
  return Object.prototype.hasOwnProperty.call(FAMILY_LOG_SUBJECT_META,kind)?kind:'OTHER';
}
export function familyLogDefaultTypes(kind:unknown):string[]{
  return [...(FAMILY_LOG_DEFAULT_TYPES[familyLogSubjectKind(kind)]||FAMILY_LOG_DEFAULT_TYPES.OTHER)];
}
export function familyLogEnabledTypes(subject:Row|undefined|null):string[]{
  if(!subject)return [...FAMILY_LOG_TYPES];
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed)){
        const out=[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))];
        if(out.length)return out;
      }
    }catch{}
  }
  return familyLogDefaultTypes(subject.subject_kind);
}
export function familyLogOverviewQuickTypes(subject:Row|undefined|null):string[]{
  if(!subject||Number(subject.show_on_family_overview)!==1)return [];
  const raw=String(subject.overview_quick_types_json||'').trim();
  if(!raw)return [];
  try{
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))]:[];
  }catch{return [];}
}
export const SLEEP_TIMER_WARNING_MINUTES=12*60;
export const SLEEP_TIMER_CONFIRM_MINUTES=16*60;
export const SLEEP_TIMER_MAX_ADJUST_MINUTES=48*60;
export function familyLogDateTime(value:unknown):string{
  const raw=String(value??'').trim().replace('T',' ');
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw))throw new FamilyLogBadRequest('記録日時が不正です。');
  return raw.length===16?`${raw}:00`:raw;
}
export function familyLogJstMs(value:unknown):number{
  const normalized=familyLogDateTime(value);
  return Date.parse(`${normalized.replace(' ','T')}+09:00`);
}
export function familyLogSubjectIcon(subject:Row|undefined|null):string{
  if(subject?.icon)return String(subject.icon);
  return FAMILY_LOG_SUBJECT_META[familyLogSubjectKind(subject?.subject_kind)]?.icon||'👤';
}
export async function ensureFamilyLogMemberSubjects(ctx:AppContext,familyId:number,createdBy:number):Promise<void>{
  const now=nowJst();
  await ctx.env.DB.prepare(`INSERT INTO family_log_subjects(family_id,member_id,name,subject_kind,birth_date,icon,active,created_by,created_at,updated_at,enabled_types_json,auto_complete_linked_task)
    SELECT mm.family_id,mm.id,mm.name,
      CASE
        WHEN upper(COALESCE(mm.member_type,'ADULT'))='BABY' THEN 'BABY'
        WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('CHILD','KID') THEN 'CHILD'
        ELSE 'ADULT'
      END,
      NULL,mm.icon,1,?,COALESCE(mm.created_at,?),?,NULL,
      CASE WHEN upper(COALESCE(mm.member_type,'ADULT')) IN ('BABY','CHILD','KID') THEN 1 ELSE 0 END
    FROM members mm
    WHERE mm.family_id=? AND mm.active=1
      AND NOT EXISTS(
        SELECT 1 FROM family_log_subjects s
        WHERE s.family_id=mm.family_id AND s.member_id=mm.id
      )`).bind(createdBy,now,now,familyId).run();
}
export function familyLogDefaultAutoComplete(kind:unknown):number{
  return ['BABY','CHILD','PET'].includes(familyLogSubjectKind(kind))?1:0;
}
export function supportsDedicatedSleep(kind:unknown):boolean{
  return ['BABY','CHILD'].includes(familyLogSubjectKind(kind));
}
function externalActionContext(env:Env,member:CurrentMember):AppContext{return {env,member,request:new Request('https://internal.invalid/'),session:{iat:0}};}
export async function recordQuickChoreDomain(env:Env,member:CurrentMember,id:number):Promise<{ok:boolean;id?:number}>{
  const chore=await env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE id=? AND family_id=? AND active=1').bind(id,member.family_id).first<Row>();
  if(!chore)return {ok:false};const now=nowJst();
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at,quick_chore_id) VALUES(?,NULL,'HOUSEWORK',?,?,?,?,?,?,?,?,?,?,?, ?,NULL,?)").bind(member.family_id,now,null,null,null,null,String(chore.name),null,null,null,member.id,now,now,id).run();
  const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'HOUSEWORK',occurred_at:now,value_text:String(chore.name),quick_chore_id:id});return {ok:true,id:logId};
}
export async function startDedicatedSleepDomain(env:Env,member:CurrentMember,subjectId:number):Promise<{ok:boolean;id?:number;already?:boolean}>{
  const child=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();if(!child||!supportsDedicatedSleep(child.subject_kind)||!familyLogEnabledTypes(child).includes('SLEEP'))return {ok:false};
  const existing=await env.DB.prepare("SELECT id FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running' LIMIT 1").bind(member.family_id,subjectId).first<Row>();if(existing)return {ok:true,id:Number(existing.id),already:true};
  const now=nowJst(),startedMs=Date.now();const r=await env.DB.prepare("INSERT INTO family_log_timers(family_id,subject_id,log_type,started_at,started_at_ms,status,note,created_by,created_at,updated_at,timer_label) SELECT ?,?,'SLEEP',?,?,'running',NULL,?,?,?,'睡眠' WHERE NOT EXISTS(SELECT 1 FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running')").bind(member.family_id,subjectId,now,startedMs,member.id,now,now,member.family_id,subjectId).run();
  let id=Number(r.meta.last_row_id||0);if(!id){const raced=await env.DB.prepare("SELECT id FROM family_log_timers WHERE family_id=? AND subject_id=? AND log_type='SLEEP' AND status='running' LIMIT 1").bind(member.family_id,subjectId).first<Row>();return {ok:true,id:Number(raced?.id||0),already:true};}await logActivity(externalActionContext(env,member),'STARTED','family_log_timer',id,{log_type:'SLEEP',subject_id:subjectId});return {ok:true,id};
}
export async function stopDedicatedSleepDomain(env:Env,member:CurrentMember,subjectId:number,timerId?:number,wakeAt=nowJst()):Promise<{ok:boolean;log_id?:number;duration_minutes?:number;already?:boolean}>{
  const child=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();if(!child||!familyLogEnabledTypes(child).includes('SLEEP'))return {ok:false};
  const timer=await env.DB.prepare(`SELECT x.*,s.name subject_name FROM family_log_timers x JOIN family_log_subjects s ON s.id=x.subject_id AND s.family_id=x.family_id AND s.active=1 AND s.subject_kind IN ('BABY','CHILD') WHERE x.family_id=? AND x.subject_id=? AND x.log_type='SLEEP' AND x.status='running' ${timerId?'AND x.id=?':''} ORDER BY x.id DESC LIMIT 1`).bind(...(timerId?[member.family_id,subjectId,timerId]:[member.family_id,subjectId])).first<Row>();
  if(!timer){const subject=await env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,member.family_id).first<Row>();return {ok:Boolean(subject),already:Boolean(subject)};}
  const wakeMs=familyLogJstMs(wakeAt),startedMs=Number(timer.started_at_ms);if(!Number.isFinite(startedMs)||wakeMs<startedMs||wakeMs>Date.now()+60000)throw new FamilyLogBadRequest('起床時刻が不正です。');const duration=Math.round((wakeMs-startedMs)/60000);if(duration>SLEEP_TIMER_MAX_ADJUST_MINUTES)throw new FamilyLogBadRequest('睡眠時間は48時間以内で指定してください。');const now=nowJst();
  const stopped=await env.DB.prepare("UPDATE family_log_timers SET status='stopped',updated_at=? WHERE id=? AND family_id=? AND log_type='SLEEP' AND status='running'").bind(now,timer.id,member.family_id).run();if(!stopped.meta.changes)return {ok:true,already:true};
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,duration_minutes,created_by,created_at,updated_at) VALUES(?,?,'SLEEP',?,?,?,?,?)").bind(member.family_id,timer.subject_id,String(timer.started_at),duration,member.id,now,now).run();const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'SLEEP',subject_id:Number(timer.subject_id),subject_name:String(timer.subject_name||''),occurred_at:String(timer.started_at),duration_minutes:duration,source:'sleep_timer'});return {ok:true,log_id:logId,duration_minutes:duration};
}
export function familyQuickChoreWeekdayMask(value:unknown):number{
  const mask=Number(value??127);
  if(!Number.isInteger(mask)||mask<0||mask>127)throw new FamilyLogBadRequest('表示曜日が不正です。');
  return mask;
}
export function familyQuickChoreWeekdayBit(date:string):number{
  const day=new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return day===0?64:1<<(day-1);
}
export function familyLogTruthy(value:unknown,fallback=false):boolean{
  if(value===undefined||value===null||value==='')return fallback;
  if(typeof value==='boolean')return value;
  return ['1','true','on','yes'].includes(String(value).toLowerCase());
}
export function normalizeMilkAmountPresets(value:unknown):number[]{
  if(!Array.isArray(value)||value.length<1||value.length>6)throw new FamilyLogBadRequest('ミルク量の候補は1〜6件で指定してください。');
  const values=value.map(Number);
  if(values.some(v=>!Number.isInteger(v)||v<1||v>2000))throw new FamilyLogBadRequest('ミルク量は1〜2000mlの整数で指定してください。');
  return [...new Set(values)];
}

function jpHolidayBase(date:string):string|null{
  const d=new Date(`${date}T12:00:00Z`);
  const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
  const nthMonday=(month:number,nth:number)=>{const first=new Date(Date.UTC(y,month-1,1));return 1+((8-first.getUTCDay())%7)+(nth-1)*7;};
  const vernal=Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const autumnal=Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const fixed:Record<string,string>={
    [`${y}-01-01`]:'元日',[`${y}-02-11`]:'建国記念の日',[`${y}-02-23`]:'天皇誕生日',[`${y}-03-${String(vernal).padStart(2,'0')}`]:'春分の日',[`${y}-04-29`]:'昭和の日',[`${y}-05-03`]:'憲法記念日',[`${y}-05-04`]:'みどりの日',[`${y}-05-05`]:'こどもの日',[`${y}-08-11`]:'山の日',[`${y}-09-${String(autumnal).padStart(2,'0')}`]:'秋分の日',[`${y}-11-03`]:'文化の日',[`${y}-11-23`]:'勤労感謝の日'
  };
  if(fixed[date])return fixed[date];
  if(m===1&&day===nthMonday(1,2))return '成人の日';
  if(m===7&&day===nthMonday(7,3))return '海の日';
  if(m===9&&day===nthMonday(9,3))return '敬老の日';
  if(m===10&&day===nthMonday(10,2))return 'スポーツの日';
  return null;
}
function jpHolidayName(date:string):string|null{
  const d=new Date(`${date}T12:00:00Z`),wd=d.getUTCDay(),base=jpHolidayBase(date);
  if(base)return base;
  if(wd>=1&&wd<=5){const prev=new Date(d);prev.setUTCDate(prev.getUTCDate()-1);const next=new Date(d);next.setUTCDate(next.getUTCDate()+1);if(jpHolidayBase(prev.toISOString().slice(0,10))&&jpHolidayBase(next.toISOString().slice(0,10)))return '国民の休日';}
  if(wd>=1&&wd<=6){const cursor=new Date(d);cursor.setUTCDate(cursor.getUTCDate()-1);for(let n=0;n<8;n++){const cd=cursor.toISOString().slice(0,10);if(cursor.getUTCDay()===0&&jpHolidayBase(cd))return '振替休日';if(jpHolidayBase(cd)){cursor.setUTCDate(cursor.getUTCDate()-1);continue;}break;}}
  return null;
}
function parseJsonArray(value:unknown):number[]{if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);try{const v=JSON.parse(String(value||'[]'));return Array.isArray(v)?v.map(Number).filter(Number.isFinite):[];}catch{return [];}}
function matchesRecurrence(rule:Row,date:string):boolean{
  const start=String(rule.start_date||''),end=String(rule.end_date||'');if(date<start||(end&&date>end)||Number(rule.active)!==1)return false;
  const d=new Date(`${date}T12:00:00Z`),sd=new Date(`${start}T12:00:00Z`),interval=Math.max(1,Number(rule.interval_value||1)),type=String(rule.recurrence_type||'DAILY'),diff=Math.floor((d.getTime()-sd.getTime())/86400000),wd=d.getUTCDay();
  if(type==='DAILY'||type==='INTERVAL_DAYS')return diff%interval===0;
  if(type==='WEEKLY'||type==='INTERVAL_WEEKS'){if(Math.floor(diff/7)%interval!==0)return false;const w=parseJsonArray(rule.weekdays_json);return (w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd);}
  if(type==='MONTHLY_DAY'){const md=parseJsonArray(rule.monthdays_json),want=md.length?md:[Number(rule.monthday||sd.getUTCDate())],months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth();return months>=0&&months%interval===0&&want.includes(d.getUTCDate());}
  if(type==='MONTHLY_WEEKDAY'){const w=parseJsonArray(rule.weekdays_json),weeks=Math.floor((d.getUTCDate()-1)/7)+1,weekList=parseJsonArray(rule.week_numbers_json),wants=weekList.length?weekList:[Number(rule.week_number||1)];return ((d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth())%interval===0&&(w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd)&&wants.includes(weeks);}
  if(type==='MONTHLY_BUSINESS_DAY'){const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth();if(months<0||months%interval!==0)return false;let n=0;for(let day=1;day<=d.getUTCDate();day++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),day)),key=x.toISOString().slice(0,10),dayOf=x.getUTCDay();if(dayOf>=1&&dayOf<=5&&jpHolidayName(key)===null)n++;}return n===Number(rule.business_day_ordinal||1);}
  if(type==='YEARLY')return (d.getUTCFullYear()-sd.getUTCFullYear())%interval===0&&d.getUTCMonth()===sd.getUTCMonth()&&d.getUTCDate()===sd.getUTCDate();
  return false;
}
async function recurringForRange(ctx:AppContext,from:string,to:string):Promise<Row[]>{
  const member=ctx.member;if(!member)throw new Error('Family Log recurrence projection requires an authenticated member.');const fid=member.family_id;
  const rules=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,t.visibility_scope,t.private_owner_id,t.task_kind,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? AND ${taskVisibilitySql('t')} AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) ORDER BY r.id`).bind(fid,member.id,to,from).all<Row>();
  if(!rules.results.length)return [];
  const projected:Array<{rule:Row;date:string}>=[];
  for(const rule of rules.results){const start=String(rule.start_date||'')>from?String(rule.start_date):from,end=String(rule.end_date||'')&&String(rule.end_date)<to?String(rule.end_date):to;for(let d=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);d<=last;d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);if(matchesRecurrence(rule,date))projected.push({rule,date});}}
  if(!projected.length)return [];
  const loadOccurrences=()=>ctx.env.DB.prepare('SELECT * FROM recurrence_occurrences WHERE family_id=? AND occurrence_date BETWEEN ? AND ?').bind(fid,from,to).all<Row>();
  let occurrenceRows=await loadOccurrences(),occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));
  const now=nowJst(),missing=projected.filter(({rule,date})=>!occurrenceByKey.has(`${Number(rule.id)}:${date}`));
  if(missing.length){const statements=missing.map(({rule,date})=>ctx.env.DB.prepare('INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(fid,Number(rule.id),date,'pending',now,now));for(let i=0;i<statements.length;i+=50){const chunk=statements.slice(i,i+50);if(chunk.length)await ctx.env.DB.batch(chunk);}occurrenceRows=await loadOccurrences();occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));}
  const [assigneeRows,completionRows]=await Promise.all([
    ctx.env.DB.prepare(`SELECT ta.task_id,GROUP_CONCAT(am.name,'、') assignees,GROUP_CONCAT(ta.member_id,',') assignee_ids,COUNT(am.id) assigned_count FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE EXISTS(SELECT 1 FROM recurrence_rules rr WHERE rr.task_id=ta.task_id AND rr.family_id=? AND rr.active=1 AND rr.start_date<=? AND (rr.end_date IS NULL OR rr.end_date>=?)) GROUP BY ta.task_id`).bind(fid,to,from).all<Row>(),
    ctx.env.DB.prepare(`SELECT c.occurrence_id,COUNT(*) c FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id JOIN recurrence_rules rr ON rr.id=o.recurrence_rule_id JOIN task_assignees ta ON ta.task_id=rr.task_id AND ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE o.family_id=? AND o.occurrence_date BETWEEN ? AND ? GROUP BY c.occurrence_id`).bind(fid,from,to).all<Row>()
  ]);
  const assigneeByTask=new Map(assigneeRows.results.map(r=>[Number(r.task_id),r])),completedByOccurrence=new Map(completionRows.results.map(r=>[Number(r.occurrence_id),Number(r.c||0)])),out:Row[]=[];
  for(const {rule,date} of projected){const occ=occurrenceByKey.get(`${Number(rule.id)}:${date}`);if(!occ)continue;if(String(occ.status||'').toLowerCase()==='excluded'||occ.exception_task_id)continue;const ass=assigneeByTask.get(Number(rule.task_id)),assigned=Number(ass?.assigned_count||0),completed=completedByOccurrence.get(Number(occ.id))||0,mode=String(rule.completion_mode||'ANY').toUpperCase(),isCompleted=mode==='ALL'?assigned>0&&completed>=assigned:completed>0,baseTime=String(rule.start_at||'').slice(11,19),endTime=String(rule.end_at||'').slice(11,19);let endDate=date;const templateStart=String(rule.start_at||'').slice(0,10),templateEnd=String(rule.end_at||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(templateStart)&&/^\d{4}-\d{2}-\d{2}$/.test(templateEnd)){const span=Math.max(0,Math.round((new Date(`${templateEnd}T12:00:00Z`).getTime()-new Date(`${templateStart}T12:00:00Z`).getTime())/86400000));if(span){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+span);endDate=d.toISOString().slice(0,10);}}out.push({...rule,id:-Number(occ.id),recurrence_occurrence_id:Number(occ.id),recurrence_rule_id:Number(rule.id),occurrence_date:date,status:isCompleted?'completed':'pending',due_at:`${date} ${baseTime||'00:00:00'}`,start_at:baseTime?`${date} ${baseTime}`:null,end_at:endTime?`${endDate} ${endTime}`:null,assignees:String(ass?.assignees||''),assignee_ids:String(ass?.assignee_ids||'')});}
  return out;
}
export async function recurringForDate(ctx:AppContext,date:string):Promise<Row[]>{return recurringForRange(ctx,date,date);}
