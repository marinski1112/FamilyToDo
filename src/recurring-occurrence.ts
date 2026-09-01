import { json, redirect } from './response';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

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
  const date=String(occ.occurrence_date);const base=String(occ.start_at||'');const st=base.slice(11,19);const et=String(occ.end_at||'').slice(11,19);const now=nowJst();
  const completeRows=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at').bind(occId).all();
  const status=completeRows.results.length&&String(occ.status||'').toLowerCase()==='completed'?'completed':'pending';
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(m.family_id,occ.title,occ.description||null,`${date} ${st||'00:00:00'}`,status,occ.completion_mode||'ANY',m.id,now,now,st?`${date} ${st}`:null,et?`${date} ${et}`:null,occ.location||null,Number(occ.all_day??1),Number(occ.calendar_visible??1),String(occ.calendar_color||'#7c3aed'),'OCCURRENCE',null).run();
  const taskId=Number(r.meta.last_row_id);

  // Preserve the series assignees and any already-recorded completion state.
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

  // A recurring template's linked shopping/items are shared by the series. Clone them
  // for the exception task so changing this one date does not detach the series template.
  const [shops,items]=await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all(),
    ctx.env.DB.prepare('SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all()
  ]);
  for(const sh of shops.results as any[]){
    const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)")
      .bind(m.family_id,String(sh.name||''),String(sh.quantity||'1'),sh.category||null,sh.memo||null,date,m.id,now,now,taskId,sh.url||null).run();
    const sid=Number(sr.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,sa.member_id FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=?').bind(sid,Number(sh.id)).run();
  }
  for(const it of items.results as any[]){
    const time=String(it.due_at||'').slice(11,19);const dueAt=`${date} ${time||'00:00:00'}`;
    const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind(m.family_id,String(it.name||''),it.memo||null,dueAt,String(it.completion_mode||'ANY'),m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();
    const iid=Number(ir.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,ia.member_id FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(iid,Number(it.id)).run();
  }

  await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,occId,m.family_id).run();
  const redirectTo=`/task/view.php?id=${taskId}`;
  return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:redirectTo}):redirect(redirectTo);
}
