import type { AppContext } from './app-context';
import { memberById } from './app-context';
import type { CurrentMember } from './types';
import { BadRequest } from './errors';
import { logActivity } from './activity-log';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { addWallClockMinutes, DEFAULT_FAMILY_TIMEZONE, familyDate, familyNow } from './timezone';
import { recurringForDate } from './recurrence-projection';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;
const FAMILY_LOG_TYPES=Object.keys(FAMILY_LOG_TYPE_META);
const FAMILY_LOG_SUBJECT_TYPES=FAMILY_LOG_TYPES.filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
const FAMILY_LOG_DEFAULT_TYPES:Record<string,string[]>={
  BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
  CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','VACCINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
  ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
  PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
  OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT'],
};
const SLEEP_TIMER_MAX_ADJUST_MINUTES=48*60;
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

function familyLogSubjectKind(value:unknown){const kind=String(value||'ADULT').toUpperCase();return Object.prototype.hasOwnProperty.call(FAMILY_LOG_DEFAULT_TYPES,kind)?kind:'OTHER';}
function familyLogDefaultTypes(kind:unknown){return [...(FAMILY_LOG_DEFAULT_TYPES[familyLogSubjectKind(kind)]||FAMILY_LOG_DEFAULT_TYPES.OTHER)];}
function familyLogEnabledTypes(subject:Row|undefined|null){
  if(!subject)return [...FAMILY_LOG_TYPES];
  const raw=String(subject.enabled_types_json||'').trim();
  if(raw){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed)){const out=[...new Set(parsed.map(x=>String(x||'').toUpperCase()).filter(x=>FAMILY_LOG_SUBJECT_TYPES.includes(x)))];if(out.length)return out;}}catch{}}
  return familyLogDefaultTypes(subject.subject_kind);
}
export function supportsDedicatedSleep(kind:unknown):boolean{return ['BABY','CHILD'].includes(familyLogSubjectKind(kind));}
function familyLogDateTime(value:unknown){const raw=String(value??'').trim().replace('T',' ');if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw))throw new BadRequest('記録日時が不正です。');return raw.length===16?`${raw}:00`:raw;}
function familyLogJstMs(value:unknown){const normalized=familyLogDateTime(value);return Date.parse(`${normalized.replace(' ','T')}+09:00`);}
function externalActionContext(env:Env,member:CurrentMember):AppContext{return {env,member,request:new Request('https://internal.invalid/'),session:{iat:0}};}

export function normalizeMilkAmountPresets(value:unknown):number[]{
  if(!Array.isArray(value)||value.length<1||value.length>6)throw new BadRequest('ミルク量の候補は1〜6件で指定してください。');
  const values=value.map(Number);
  if(values.some(v=>!Number.isInteger(v)||v<1||v>2000))throw new BadRequest('ミルク量は1〜2000mlの整数で指定してください。');
  return [...new Set(values)];
}

export async function recordQuickChoreDomain(env:Env,member:CurrentMember,id:number):Promise<{ok:boolean;id?:number}>{
  const chore=await env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE id=? AND family_id=? AND active=1').bind(id,member.family_id).first<Row>();
  if(!chore)return {ok:false};const now=nowJst();
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at,quick_chore_id) VALUES(?,NULL,'HOUSEWORK',?,?,?,?,?,?,?,?,?,?,?, ?,NULL,?)").bind(member.family_id,now,null,null,null,null,String(chore.name),null,null,null,member.id,now,now,id).run();
  const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'HOUSEWORK',occurred_at:now,value_text:String(chore.name),quick_chore_id:id});return {ok:true,id:logId};
}

export async function createExternalShoppingItemDomain(env:Env,member:CurrentMember,input:{name:string;quantity:number}):Promise<{ok:boolean;id?:number}>{
  const name=String(input.name||'').trim();
  if(!name||name.length>255||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>999)return {ok:false};
  const n=nowJst();
  const r=await env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,NULL,NULL,'pending',?,?,?,NULL,NULL)").bind(member.family_id,name,String(input.quantity),member.id,n,n).run();
  const id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};
  await env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1 AND deleted_at IS NULL').bind(id,member.id,member.family_id).run();
  return {ok:true,id};
}

export async function recordConfiguredQuickActionDomain(env:Env,member:CurrentMember,quickActionId:number):Promise<{ok:boolean;id?:number}>{
  const qa=await env.DB.prepare(`SELECT q.*,s.enabled_types_json,s.subject_kind FROM family_log_quick_actions q JOIN family_log_subjects s ON s.id=q.subject_id AND s.family_id=q.family_id AND s.active=1 WHERE q.id=? AND q.family_id=? AND q.active=1 AND q.mode='QUICK' LIMIT 1`).bind(quickActionId,member.family_id).first<Row>();if(!qa)return {ok:false};
  const type=String(qa.log_type||'');if(!FAMILY_LOG_TYPES.includes(type)||!familyLogEnabledTypes(qa).includes(type))return {ok:false};const allowed:Record<string,string[]>={DIAPER:['WET','DIRTY','BOTH'],MEAL:['BREAKFAST','LUNCH','DINNER','SNACK','BABY_FOOD','OTHER'],BATH:['BATH','SHOWER'],CONDITION:['GOOD','NORMAL','TIRED','SICK','VOMIT']},detail=String(qa.detail_code||'')||null;if(detail&&allowed[type]&&!allowed[type].includes(detail))return {ok:false};const amount=qa.amount===null?null:Number(qa.amount);if(amount!==null&&(!Number.isFinite(amount)||amount<-100000||amount>100000))return {ok:false};
  const now=nowJst(),r=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL,?,NULL,NULL,NULL,?,?,?,NULL)').bind(member.family_id,Number(qa.subject_id),type,now,detail,amount,qa.unit||null,qa.value_text||null,member.id,now,now).run(),id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{quick_action_id:quickActionId,source:'shared_quick_action'});return {ok:true,id};
}

export async function recordGoogleVoiceFamilyLogDomain(env:Env,member:CurrentMember,input:{subjectId:number;logType:string;detailCode:string|null;amount:number|null;unit:string|null;occurredOffsetMinutes:number}):Promise<{ok:boolean;id?:number}>{
  if(!Number.isInteger(input.occurredOffsetMinutes)||input.occurredOffsetMinutes<0||input.occurredOffsetMinutes>1440)return {ok:false};
  const subject=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD','PET')").bind(input.subjectId,member.family_id).first<Row>();
  if(!subject||!familyLogEnabledTypes(subject).includes(input.logType))return {ok:false};
  const allowed:Record<string,string[]>={DIAPER:['WET','DIRTY'],TOILET:['WET','DIRTY'],MEAL:['BABY_FOOD'],BATH:['BATH'],CONDITION:['VOMIT']};if(input.detailCode&&(!allowed[input.logType]||!allowed[input.logType].includes(input.detailCode)))return {ok:false};
  if(input.logType==='MILK'&&(!Number.isInteger(input.amount)||Number(input.amount)<1||Number(input.amount)>2000||input.unit!=='ml'))return {ok:false};
  if(input.logType==='TEMPERATURE'&&(input.amount===null||input.amount<30||input.amount>45||input.unit!=='℃'))return {ok:false};
  const family=await env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(member.family_id).first<Row>();if(!family)return {ok:false};const current=familyNow(String(family.timezone||DEFAULT_FAMILY_TIMEZONE)),occurred=addWallClockMinutes(current,-input.occurredOffsetMinutes);
  const result=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)').bind(member.family_id,input.subjectId,input.logType,occurred,input.detailCode,input.amount,input.unit,member.id,current,current).run(),id=Number(result.meta.last_row_id||0);if(!id)return {ok:false};await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{source:'google_tasks_voice',occurred_offset_minutes:input.occurredOffsetMinutes});return {ok:true,id};
}

export type ExternalFamilyLogPreset='NOW'|'MINUS_60';
export async function recordExternalFamilyLogDomain(env:Env,member:CurrentMember,subjectId:number,detailCode:'WET'|'DIRTY',preset:ExternalFamilyLogPreset):Promise<{ok:boolean;id?:number;operation?:string;occurred_at?:string}>{
  if(!['NOW','MINUS_60'].includes(preset)||!['WET','DIRTY'].includes(detailCode))return {ok:false};
  const subject=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,member.family_id).first<Row>();
  if(!subject)return {ok:false};
  const kind=String(subject.subject_kind),logType=kind==='BABY'?'DIAPER':'TOILET';
  if(!familyLogEnabledTypes(subject).includes(logType))return {ok:false};
  const family=await env.DB.prepare('SELECT timezone FROM families WHERE id=? LIMIT 1').bind(member.family_id).first<Row>();
  if(!family)return {ok:false};
  const current=familyNow(String(family.timezone||DEFAULT_FAMILY_TIMEZONE));
  const occurredAt=preset==='MINUS_60'?addWallClockMinutes(current,-60):current;
  const r=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,NULL)').bind(member.family_id,subjectId,logType,occurredAt,detailCode,member.id,current,current).run();
  const id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};
  const operation=`${logType}_${detailCode}`;
  await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{log_type:logType,detail_code:detailCode,subject_id:subjectId,occurred_at:occurredAt,source:'google_home_scene',operation});
  return {ok:true,id,operation,occurred_at:occurredAt};
}

const EXTERNAL_VALUELESS_PET_TYPES=new Set(['MEAL','BATH','MEDICINE','WATER']);
export async function recordExternalPetQuickLogDomain(env:Env,member:CurrentMember,subjectId:number,logType:string):Promise<{ok:boolean;id?:number;operation?:string}>{
  const type=String(logType).toUpperCase();if(!EXTERNAL_VALUELESS_PET_TYPES.has(type))return {ok:false};
  const subject=await env.DB.prepare("SELECT id,subject_kind,enabled_types_json,overview_quick_types_json FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind='PET'").bind(subjectId,member.family_id).first<Row>();if(!subject||!familyLogEnabledTypes(subject).includes(type))return {ok:false};
  let quick:string[]=[];try{const parsed=JSON.parse(String(subject.overview_quick_types_json||'[]'));if(Array.isArray(parsed))quick=parsed.map(String).map(x=>x.toUpperCase());}catch{}if(!quick.includes(type))return {ok:false};
  const family=await env.DB.prepare('SELECT timezone FROM families WHERE id=?').bind(member.family_id).first<Row>();if(!family)return {ok:false};const n=familyNow(String(family.timezone||DEFAULT_FAMILY_TIMEZONE));
  const r=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL)').bind(member.family_id,subjectId,type,n,member.id,n,n).run(),id=Number(r.meta.last_row_id||0);if(!id)return {ok:false};await logActivity(externalActionContext(env,member),'CREATED','family_log',id,{log_type:type,subject_id:subjectId,occurred_at:n,source:'google_home_scene',operation:`PET_${type}`});return {ok:true,id,operation:`PET_${type}`};
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
  const wakeMs=familyLogJstMs(wakeAt),startedMs=Number(timer.started_at_ms);if(!Number.isFinite(startedMs)||wakeMs<startedMs||wakeMs>Date.now()+60000)throw new BadRequest('起床時刻が不正です。');const duration=Math.round((wakeMs-startedMs)/60000);if(duration>SLEEP_TIMER_MAX_ADJUST_MINUTES)throw new BadRequest('睡眠時間は48時間以内で指定してください。');const now=nowJst();
  const stopped=await env.DB.prepare("UPDATE family_log_timers SET status='stopped',updated_at=? WHERE id=? AND family_id=? AND log_type='SLEEP' AND status='running'").bind(now,timer.id,member.family_id).run();if(!stopped.meta.changes)return {ok:true,already:true};
  const r=await env.DB.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,duration_minutes,created_by,created_at,updated_at) VALUES(?,?,'SLEEP',?,?,?,?,?)").bind(member.family_id,timer.subject_id,String(timer.started_at),duration,member.id,now,now).run();const logId=Number(r.meta.last_row_id);await logActivity(externalActionContext(env,member),'CREATED','family_log',logId,{log_type:'SLEEP',subject_id:Number(timer.subject_id),subject_name:String(timer.subject_name||''),occurred_at:String(timer.started_at),duration_minutes:duration,source:'sleep_timer'});return {ok:true,log_id:logId,duration_minutes:duration};
}

export type GoogleVoiceInquiryLineKind='TODAY_SCHEDULE'|'TOMORROW_SCHEDULE'|'OPEN_SHOPPING';
export async function resolveGoogleVoiceInquiryLines(env:Env,familyId:number,memberId:number,kind:GoogleVoiceInquiryLineKind):Promise<readonly string[]>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('invalid-google-inquiry-scope');
  const member=await memberById(env,memberId);
  if(!member||member.family_id!==familyId)throw new Error('google-inquiry-member-tenant-mismatch');
  if(kind==='OPEN_SHOPPING'){
    const rows=await env.DB.prepare(`SELECT s.name,s.quantity FROM shopping_items s WHERE s.family_id=? AND s.status='pending' AND ${taskChildVisibilitySql('s')} ORDER BY CASE WHEN s.due_date IS NULL OR s.due_date='' THEN 1 ELSE 0 END,s.due_date,s.id LIMIT 32`).bind(familyId,memberId).all<Row>();
    return rows.results.map(row=>{const name=String(row.name||'').trim();const quantity=Number(row.quantity||1);return name?(Number.isFinite(quantity)&&quantity>1?`${name} ×${quantity}`:name):'';}).filter(Boolean);
  }
  const zone=String(member.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE),base=familyDate(zone);
  let date=base;
  if(kind==='TOMORROW_SCHEDULE'){const d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10);}
  const [tasks,recurring]=await Promise.all([
    env.DB.prepare(`SELECT t.* FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status IN ('pending','completed') AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template')) AND ((lower(COALESCE(t.task_kind,''))='event' AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.start_at))>=date(?)) OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?)))) OR (lower(COALESCE(t.task_kind,''))<>'event' AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?))) OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))))) ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id`).bind(familyId,memberId,date,date,date,date,date,date).all<Row>(),
    recurringForDate({env,member,request:new Request('https://internal.invalid/'),session:{iat:0}} as AppContext,date),
  ]);
  return [...tasks.results,...recurring].filter(row=>String(row.status||'pending')!=='completed').sort((a,b)=>String(a.start_at||a.due_at).localeCompare(String(b.start_at||b.due_at))).slice(0,32).map(row=>String(row.title||'').trim()).filter(Boolean);
}
