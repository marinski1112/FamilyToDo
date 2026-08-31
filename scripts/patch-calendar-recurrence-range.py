from pathlib import Path
import re

path=Path('src/app.ts')
source=path.read_text()

new_block=r'''async function recurringForRange(ctx:AppContext,from:string,to:string):Promise<Row[]> {
  const member=requireMember(ctx),fid=member.family_id;
  const rules=await ctx.env.DB.prepare(`SELECT r.*,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.completion_mode,t.calendar_color,t.visibility_scope,t.private_owner_id,t.task_kind,(SELECT id FROM task_family_log_templates ft WHERE ft.task_id=t.id AND ft.family_id=t.family_id AND ft.active=1 LIMIT 1) family_log_template_id FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id WHERE r.family_id=? AND ${taskVisibilitySql('t')} AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) ORDER BY r.id`).bind(fid,member.id,to,from).all<Row>();
  if(!rules.results.length)return [];

  const projected:Array<{rule:Row;date:string}>=[];
  for(const rule of rules.results){
    const start=String(rule.start_date||'')>from?String(rule.start_date):from;
    const end=String(rule.end_date||'')&&String(rule.end_date)<to?String(rule.end_date):to;
    for(let d=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);d<=last;d.setUTCDate(d.getUTCDate()+1)){
      const date=d.toISOString().slice(0,10);
      if(matchesRecurrence(rule,date))projected.push({rule,date});
    }
  }
  if(!projected.length)return [];

  const loadOccurrences=()=>ctx.env.DB.prepare('SELECT * FROM recurrence_occurrences WHERE family_id=? AND occurrence_date BETWEEN ? AND ?').bind(fid,from,to).all<Row>();
  let occurrenceRows=await loadOccurrences();
  let occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));
  const now=nowJst();
  const missing=projected.filter(({rule,date})=>!occurrenceByKey.has(`${Number(rule.id)}:${date}`));
  if(missing.length){
    const statements=missing.map(({rule,date})=>ctx.env.DB.prepare('INSERT OR IGNORE INTO recurrence_occurrences(family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(fid,Number(rule.id),date,'pending',now,now));
    for(let i=0;i<statements.length;i+=50){const chunk=statements.slice(i,i+50);if(chunk.length)await ctx.env.DB.batch(chunk);}
    occurrenceRows=await loadOccurrences();
    occurrenceByKey=new Map(occurrenceRows.results.map(o=>[`${Number(o.recurrence_rule_id)}:${String(o.occurrence_date)}`,o]));
  }

  const [assigneeRows,completionRows]=await Promise.all([
    ctx.env.DB.prepare(`SELECT ta.task_id,GROUP_CONCAT(am.name,'、') assignees,GROUP_CONCAT(ta.member_id,',') assignee_ids,COUNT(am.id) assigned_count FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE EXISTS(SELECT 1 FROM recurrence_rules rr WHERE rr.task_id=ta.task_id AND rr.family_id=? AND rr.active=1 AND rr.start_date<=? AND (rr.end_date IS NULL OR rr.end_date>=?)) GROUP BY ta.task_id`).bind(fid,to,from).all<Row>(),
    ctx.env.DB.prepare(`SELECT c.occurrence_id,COUNT(*) c FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id JOIN recurrence_rules rr ON rr.id=o.recurrence_rule_id JOIN task_assignees ta ON ta.task_id=rr.task_id AND ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE o.family_id=? AND o.occurrence_date BETWEEN ? AND ? GROUP BY c.occurrence_id`).bind(fid,from,to).all<Row>()
  ]);
  const assigneeByTask=new Map(assigneeRows.results.map(r=>[Number(r.task_id),r]));
  const completedByOccurrence=new Map(completionRows.results.map(r=>[Number(r.occurrence_id),Number(r.c||0)]));
  const out:Row[]=[];
  for(const {rule,date} of projected){
    const occ=occurrenceByKey.get(`${Number(rule.id)}:${date}`);if(!occ)continue;
    if(String(occ.status||'').toLowerCase()==='excluded'||occ.exception_task_id)continue;
    const ass=assigneeByTask.get(Number(rule.task_id));
    const assigned=Number(ass?.assigned_count||0),completed=completedByOccurrence.get(Number(occ.id))||0;
    const mode=String(rule.completion_mode||'ANY').toUpperCase();
    const isCompleted=mode==='ALL'?assigned>0&&completed>=assigned:completed>0;
    const baseTime=String(rule.start_at||'').slice(11,19),endTime=String(rule.end_at||'').slice(11,19);
    let endDate=date;
    const templateStart=String(rule.start_at||'').slice(0,10),templateEnd=String(rule.end_at||'').slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(templateStart)&&/^\d{4}-\d{2}-\d{2}$/.test(templateEnd)){
      const span=Math.max(0,Math.round((new Date(`${templateEnd}T12:00:00Z`).getTime()-new Date(`${templateStart}T12:00:00Z`).getTime())/86400000));
      if(span){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+span);endDate=d.toISOString().slice(0,10);}
    }
    out.push({...rule,id:-Number(occ.id),recurrence_occurrence_id:Number(occ.id),recurrence_rule_id:Number(rule.id),occurrence_date:date,status:isCompleted?'completed':'pending',due_at:`${date} ${baseTime||'00:00:00'}`,start_at:baseTime?`${date} ${baseTime}`:null,end_at:endTime?`${endDate} ${endTime}`:null,assignees:String(ass?.assignees||''),assignee_ids:String(ass?.assignee_ids||'')});
  }
  return out;
}
async function recurringForDate(ctx:AppContext,date:string):Promise<Row[]> {
  return recurringForRange(ctx,date,date);
}

async function expiredTasksFor'''

pattern=r"async function recurringForDate\(ctx:AppContext,date:string\):Promise<Row\[]> \{[\s\S]*?\n\}\n\nasync function expiredTasksFor"
source,count=re.subn(pattern,new_block,source,count=1)
if count!=1: raise SystemExit(f'expected one recurringForDate block, replaced {count}')

old_loop=r'''  const recurRows:Row[]=[];
  for(let d=new Date(`${from}T12:00:00Z`);d<=new Date(`${to}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){
    recurRows.push(...await recurringForDate(ctx,d.toISOString().slice(0,10)));
  }
  const visibleRecur=recurRows.filter(t=>Number(t.calendar_visible??1)===1 && view!=='private' && (view!=='assigned'||String(t.assignee_ids||'').split(',').map(Number).includes(member.id)));'''
new_loop=r'''  const recurRows=await recurringForRange(ctx,from,to);
  const visibleRecur=recurRows.filter(t=>{
    if(Number(t.calendar_visible??1)!==1)return false;
    const scope=String(t.visibility_scope||'FAMILY').toUpperCase();
    if(view==='family')return scope==='FAMILY';
    if(view==='assigned')return scope==='FAMILY'&&String(t.assignee_ids||'').split(',').map(Number).includes(member.id);
    if(view==='private')return scope==='PRIVATE'&&Number(t.private_owner_id)===member.id;
    return scope==='FAMILY'||(scope==='PRIVATE'&&Number(t.private_owner_id)===member.id);
  });'''
if source.count(old_loop)!=1: raise SystemExit(f'expected one calendar recurrence loop, found {source.count(old_loop)}')
source=source.replace(old_loop,new_loop,1)
path.write_text(source)
