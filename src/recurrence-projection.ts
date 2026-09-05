import type { AppContext } from './app-context';
import { calendarRangeOffsetDays, shiftCalendarDateOnly } from './task-range-safety';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const recurrenceOverlapSql=(ruleAlias:string,taskAlias:string)=>`(${ruleAlias}.end_date IS NULL OR date(${ruleAlias}.end_date, '+' || CAST(CASE WHEN ${taskAlias}.start_at IS NOT NULL AND ${taskAlias}.end_at IS NOT NULL AND date(${taskAlias}.end_at)>date(${taskAlias}.start_at) THEN CAST(julianday(date(${taskAlias}.end_at))-julianday(date(${taskAlias}.start_at)) AS INTEGER) ELSE 0 END AS TEXT) || ' days')>=date(?))`;

export function parseJsonArray(value:unknown):number[]{
  if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);
  try{const v=JSON.parse(String(value||'[]'));return Array.isArray(v)?v.map(Number).filter(Number.isFinite):[];}catch{return [];}
}

function jpHolidayBase(date:string):string|null{
  const d=new Date(`${date}T12:00:00Z`);
  const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
  const nthMonday=(month:number,nth:number)=>{const first=new Date(Date.UTC(y,month-1,1));return 1+((8-first.getUTCDay())%7)+(nth-1)*7;};
  const vernal=Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const autumnal=Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));
  const fixed:Record<string,string>={
    [`${y}-01-01`]:'元日',[`${y}-02-11`]:'建国記念の日',[`${y}-02-23`]:'天皇誕生日',
    [`${y}-03-${String(vernal).padStart(2,'0')}`]:'春分の日',[`${y}-04-29`]:'昭和の日',[`${y}-05-03`]:'憲法記念日',
    [`${y}-05-04`]:'みどりの日',[`${y}-05-05`]:'こどもの日',[`${y}-08-11`]:'山の日',
    [`${y}-09-${String(autumnal).padStart(2,'0')}`]:'秋分の日',[`${y}-11-03`]:'文化の日',[`${y}-11-23`]:'勤労感謝の日'
  };
  if(fixed[date])return fixed[date];
  if(m===1&&day===nthMonday(1,2))return '成人の日';
  if(m===7&&day===nthMonday(7,3))return '海の日';
  if(m===9&&day===nthMonday(9,3))return '敬老の日';
  if(m===10&&day===nthMonday(10,2))return 'スポーツの日';
  return null;
}

export function jpHolidayName(date:string):string|null{
  const d=new Date(`${date}T12:00:00Z`),wd=d.getUTCDay(),base=jpHolidayBase(date);
  if(base)return base;
  if(wd>=1&&wd<=5){const prev=new Date(d);prev.setUTCDate(prev.getUTCDate()-1);const next=new Date(d);next.setUTCDate(next.getUTCDate()+1);if(jpHolidayBase(prev.toISOString().slice(0,10))&&jpHolidayBase(next.toISOString().slice(0,10)))return '国民の休日';}
  if(wd>=1&&wd<=6){const cursor=new Date(d);cursor.setUTCDate(cursor.getUTCDate()-1);for(let n=0;n<8;n++){const cd=cursor.toISOString().slice(0,10);if(cursor.getUTCDay()===0&&jpHolidayBase(cd))return '振替休日';if(jpHolidayBase(cd)){cursor.setUTCDate(cursor.getUTCDate()-1);continue;}break;}}
  return null;
}

export function matchesRecurrence(rule:Row,date:string):boolean{
  const start=String(rule.start_date||''),end=String(rule.end_date||'');
  if(date<start||(end&&date>end)||Number(rule.active)!==1)return false;
  const d=new Date(`${date}T12:00:00Z`),sd=new Date(`${start}T12:00:00Z`);
  const interval=Math.max(1,Number(rule.interval_value||1)),type=String(rule.recurrence_type||'DAILY');
  const diff=Math.floor((d.getTime()-sd.getTime())/86400000),wd=d.getUTCDay();
  if(type==='DAILY'||type==='INTERVAL_DAYS')return diff%interval===0;
  if(type==='WEEKLY'||type==='INTERVAL_WEEKS'){if(Math.floor(diff/7)%interval!==0)return false;const w=parseJsonArray(rule.weekdays_json);return (w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd);}
  if(type==='MONTHLY_DAY'){const md=parseJsonArray(rule.monthdays_json),want=md.length?md:[Number(rule.monthday||sd.getUTCDate())],months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth();return months>=0&&months%interval===0&&want.includes(d.getUTCDate());}
  if(type==='MONTHLY_WEEKDAY'){const w=parseJsonArray(rule.weekdays_json),weeks=Math.floor((d.getUTCDate()-1)/7)+1,weekList=parseJsonArray(rule.week_numbers_json),wants=weekList.length?weekList:[Number(rule.week_number||1)];return ((d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth())%interval===0&&(w.length?w:[Number(rule.weekday??sd.getUTCDay())]).includes(wd)&&wants.includes(weeks);}
  if(type==='MONTHLY_BUSINESS_DAY'){const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth();if(months<0||months%interval!==0)return false;let n=0;for(let day=1;day<=d.getUTCDate();day++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),day)),key=x.toISOString().slice(0,10),dayOf=x.getUTCDay();if(dayOf>=1&&dayOf<=5&&jpHolidayName(key)===null)n++;}return n===Number(rule.business_day_ordinal||1);}
  if(type==='YEARLY')return (d.getUTCFullYear()-sd.getUTCFullYear())%interval===0&&d.getUTCMonth()===sd.getUTCMonth()&&d.getUTCDate()===sd.getUTCDate();
  return false;
}

export async function recurringForRange(ctx:AppContext,from:string,to:string):Promise<Row[]>{
  const member=ctx.member;if(!member)throw new Error('recurrence projection requires authenticated member');
  const fid=member.family_id,overlapSql=recurrenceOverlapSql('r','t');
  const rules=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,t.visibility_scope,t.private_owner_id,t.task_kind,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? AND ${taskVisibilitySql('t')} AND r.active=1 AND r.start_date<=? AND ${overlapSql} ORDER BY r.id`).bind(fid,member.id,to,from).all<Row>();
  if(!rules.results.length)return [];
  const projected:Array<{rule:Row;date:string}>=[];
  for(const rule of rules.results){const spanDays=calendarRangeOffsetDays(rule.start_at,rule.end_at),anchorFrom=shiftCalendarDateOnly(from,-spanDays),start=String(rule.start_date||'')>anchorFrom?String(rule.start_date):anchorFrom,end=String(rule.end_date||'')&&String(rule.end_date)<to?String(rule.end_date):to;if(!start||start>end)continue;for(let d=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);d<=last;d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);if(matchesRecurrence(rule,date))projected.push({rule,date});}}
  if(!projected.length)return [];
  const occurrenceFrom=projected.reduce((earliest,current)=>current.date<earliest?current.date:earliest,from);
  const loadOccurrences=()=>ctx.env.DB.prepare('SELECT * FROM recurrence_occurrences WHERE family_id=? AND occurrence_date BETWEEN ? AND ?').bind(fid,occurrenceFrom,to).all<Row>();
  let occurrenceRows=await loadOccurrences(),occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));
  const now=nowJst(),missing=projected.filter(({rule,date})=>!occurrenceByKey.has(`${Number(rule.id)}:${date}`));
  if(missing.length){const statements=missing.map(({rule,date})=>ctx.env.DB.prepare('INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(fid,Number(rule.id),date,'pending',now,now));for(let i=0;i<statements.length;i+=50){const chunk=statements.slice(i,i+50);if(chunk.length)await ctx.env.DB.batch(chunk);}occurrenceRows=await loadOccurrences();occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));}
  const assigneeOverlapSql=recurrenceOverlapSql('rr','rt');
  const [assigneeRows,completionRows]=await Promise.all([
    ctx.env.DB.prepare(`SELECT ta.task_id,GROUP_CONCAT(am.name,'、') assignees,GROUP_CONCAT(ta.member_id,',') assignee_ids,COUNT(am.id) assigned_count FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE EXISTS(SELECT 1 FROM recurrence_rules rr JOIN tasks rt ON rt.id=rr.task_id AND rt.family_id=rr.family_id WHERE rr.task_id=ta.task_id AND rr.family_id=? AND rr.active=1 AND rr.start_date<=? AND ${assigneeOverlapSql}) GROUP BY ta.task_id`).bind(fid,to,from).all<Row>(),
    ctx.env.DB.prepare(`SELECT c.occurrence_id,COUNT(*) c FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id JOIN recurrence_rules rr ON rr.id=o.recurrence_rule_id JOIN members cm ON cm.id=c.member_id AND cm.family_id=o.family_id AND cm.active=1 WHERE o.family_id=? AND o.occurrence_date BETWEEN ? AND ? AND (NOT EXISTS(SELECT 1 FROM task_assignees ta0 JOIN members am0 ON am0.id=ta0.member_id AND am0.active=1 WHERE ta0.task_id=rr.task_id) OR EXISTS(SELECT 1 FROM task_assignees ta1 JOIN members am1 ON am1.id=ta1.member_id AND am1.active=1 WHERE ta1.task_id=rr.task_id AND ta1.member_id=c.member_id)) GROUP BY c.occurrence_id`).bind(fid,occurrenceFrom,to).all<Row>()
  ]);
  const assigneeByTask=new Map(assigneeRows.results.map(r=>[Number(r.task_id),r])),completedByOccurrence=new Map(completionRows.results.map(r=>[Number(r.occurrence_id),Number(r.c||0)])),out:Row[]=[];
  for(const {rule,date} of projected){const occ=occurrenceByKey.get(`${Number(rule.id)}:${date}`);if(!occ||String(occ.status||'').toLowerCase()==='excluded'||occ.exception_task_id)continue;const ass=assigneeByTask.get(Number(rule.task_id)),assigned=Number(ass?.assigned_count||0),completed=completedByOccurrence.get(Number(occ.id))||0,mode=assigned>0?String(rule.completion_mode||'ANY').toUpperCase():'ANY',isCompleted=mode==='ALL'?assigned>0&&completed>=assigned:completed>0,baseTime=String(rule.start_at||'').slice(11,19),endTime=String(rule.end_at||'').slice(11,19),endDate=shiftCalendarDateOnly(date,calendarRangeOffsetDays(rule.start_at,rule.end_at));out.push({...rule,id:-Number(occ.id),recurrence_occurrence_id:Number(occ.id),recurrence_rule_id:Number(rule.id),occurrence_date:date,status:isCompleted?'completed':'pending',due_at:`${date} ${baseTime||'00:00:00'}`,start_at:baseTime?`${date} ${baseTime}`:null,end_at:endTime?`${endDate} ${endTime}`:null,assignees:String(ass?.assignees||''),assignee_ids:String(ass?.assignee_ids||'')});}
  return out;
}

export async function recurringForDate(ctx:AppContext,date:string):Promise<Row[]>{return recurringForRange(ctx,date,date);}
