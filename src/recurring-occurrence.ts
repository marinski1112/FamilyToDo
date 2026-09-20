import { json, redirect } from './response';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function shiftedOccurrenceEndDate(occurrenceDate:string,templateStartAt:unknown,templateEndAt:unknown):string{
  const templateStart=String(templateStartAt||'').slice(0,10),templateEnd=String(templateEndAt||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(templateStart)||!/^\d{4}-\d{2}-\d{2}$/.test(templateEnd))return occurrenceDate;
  const span=Math.max(0,Math.round((new Date(`${templateEnd}T12:00:00Z`).getTime()-new Date(`${templateStart}T12:00:00Z`).getTime())/86400000));
  if(!span)return occurrenceDate;
  const shifted=new Date(`${occurrenceDate}T12:00:00Z`);shifted.setUTCDate(shifted.getUTCDate()+span);return shifted.toISOString().slice(0,10);
}

export async function convertOccurrence(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const ct=request.headers.get('content-type')||'';
  let b:any={};
  if(ct.includes('application/json')) b=await request.json().catch(()=>({}));
  else {const fd=await request.formData().catch(()=>new FormData());const obj:any={};fd.forEach((v,k)=>{obj[k]=v});b=obj;}
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const occId=Number(b.occurrence_id||0);if(!occId)return json({ok:false,error:'発生日が不正です。'},400);
  const occ=await ctx.env.DB.prepare('SELECT o.*,r.task_id,r.name,r.recurrence_type,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.calendar_color,t.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id JOIN tasks t ON t.id=r.task_id WHERE o.id=? AND o.family_id=? LIMIT 1').bind(occId,m.family_id).first();
  if(!occ)return json({ok:false,error:'発生日が見つかりません。'},404);
  if(occ.exception_task_id){const taskId=Number(occ.exception_task_id);return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:`/task/view.php?id=${taskId}`}):redirect(`/task/view.php?id=${taskId}`);}
  const date=String(occ.occurrence_date);const base=String(occ.start_at||'');const st=base.slice(11,19);const et=String(occ.end_at||'').slice(11,19);const endDate=shiftedOccurrenceEndDate(date,occ.start_at,occ.end_at);const now=nowJst();
  const completeRows=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at').bind(occId).all();
  const status=completeRows.results.length&&String(occ.status||'').toLowerCase()==='completed'?'completed':'pending';
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(m.family_id,occ.title,occ.description||null,`${date} ${st||'00:00:00'}`,status,occ.completion_mode||'ANY',m.id,now,now,st?`${date} ${st}`:null,et?`${endDate} ${et}`:null,occ.location||null,Number(occ.all_day??1),Number(occ.calendar_visible??1),String(occ.calendar_color||'#7c3aed'),'OCCURRENCE',null).run();
  const taskId=Number(r.meta.last_row_id);

  // Preserve only task assignment/completion state. Shopping and belongings are independent
  // checklist entities and are never cloned when a recurring occurrence becomes an exception.
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,ta.member_id FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(taskId,Number(occ.task_id)).run();
  if(completeRows.results.length){
    await ctx.env.DB.batch(completeRows.results.flatMap((c:any)=>[
      ctx.env.DB.prepare("INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at) VALUES(?,?,'completed',?)").bind(taskId,Number(c.member_id),String(c.completed_at)),
      ctx.env.DB.prepare("INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,'COMPLETED',?)").bind(taskId,Number(c.member_id),String(c.completed_at))
    ]));
    if(status==='completed'){
      const last=completeRows.results[completeRows.results.length-1] as any;
      await ctx.env.DB.prepare('UPDATE tasks SET completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(Number(last.member_id),String(last.completed_at),now,taskId,m.family_id).run();
    }
  }

  await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,occId,m.family_id).run();
  const redirectTo=`/task/view.php?id=${taskId}`;
  return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:redirectTo}):redirect(redirectTo);
}
