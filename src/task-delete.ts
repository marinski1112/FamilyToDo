import { json, redirect } from './response';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { queueCalendarProjectionAfterMutation } from './google-calendar';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function taskDelete(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST'&&request.method!=='DELETE') return json({ok:false,error:'POST/DELETE only'},405);
  const m=ctx.member;if(!m)return redirect('/login.php');
  const id=Number(new URL(request.url).searchParams.get('id')||0) || Number((await request.clone().json().catch(()=>({}))).id||0);
  if(!id)return json({ok:false,error:'idが不正です。'},400);
  const body=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
  const csrf=request.headers.get('x-csrf')||String(body.csrf||'');
  if(csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const task=await ctx.env.DB.prepare('SELECT created_by,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first();
  if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
  const exceptionOrigin=await ctx.env.DB.prepare('SELECT o.id,o.recurrence_rule_id,o.occurrence_date FROM recurrence_occurrences o WHERE o.exception_task_id=? AND o.family_id=? LIMIT 1').bind(id,m.family_id).first();
  const exceptionMode=String(new URL(request.url).searchParams.get('exception_mode')||'');
  if(exceptionOrigin&&!['restore','exclude'].includes(exceptionMode))return json({ok:false,error:'このタスクは定期タスクの例外です。削除後の扱いを選択してください。'},400);
  let restoredStatus='pending',restoredBy:null|number=null,restoredAt:null|string=null;
  if(exceptionOrigin&&exceptionMode==='restore'){
    const rr=await ctx.env.DB.prepare('SELECT r.task_id,t.completion_mode FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.id=? AND r.family_id=? LIMIT 1').bind(Number(exceptionOrigin.recurrence_rule_id),m.family_id).first();
    const assigned=Number((await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rr?.task_id||0)).first())?.c||0);
    const completed=Number((await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=? AND ta.task_id=?').bind(Number(exceptionOrigin.id),Number(rr?.task_id||0)).first())?.c||0);
    const last=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at DESC LIMIT 1').bind(Number(exceptionOrigin.id)).first();
    const mode=String(rr?.completion_mode||'ANY').toUpperCase();
    const complete=assigned>0&&(mode==='ALL'?completed>=assigned:completed>0);
    if(complete){restoredStatus='completed';restoredBy=Number(last?.member_id||0)||null;restoredAt=String(last?.completed_at||'')||null;}
  }
  const childShopping=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const childItems=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const recurrenceRules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const statements:any[]=[];
  const deleteNow=nowJst();
  statements.push(ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(deleteNow,id,m.family_id));
  if(exceptionOrigin&&exceptionMode==='exclude'){
    statements.push(
      ...archiveRecurrenceOccurrenceCompletionStatements(ctx.env.DB,m.family_id,Number(exceptionOrigin.id),deleteNow,'recurrence_occurrence_excluded'),
      ctx.env.DB.prepare("UPDATE recurrence_occurrences SET exception_task_id=NULL,status='excluded',completed_by=NULL,completed_at=NULL,updated_at=? WHERE id=? AND family_id=?").bind(deleteNow,Number(exceptionOrigin.id),m.family_id)
    );
  }else if(exceptionOrigin&&exceptionMode==='restore'){
    statements.push(ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=NULL,status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(restoredStatus,restoredBy,restoredAt,deleteNow,Number(exceptionOrigin.id),m.family_id));
  }
  for(const r of recurrenceRules.results){
    statements.push(
      ...archiveRecurrenceRuleOccurrenceStatements(ctx.env.DB,m.family_id,Number(r.id),deleteNow),
      ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
    );
  }
  for(const r of childShopping.results){const sid=Number(r.id);statements.push(
    ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(sid),
    ...archiveShoppingCompletionStatements(ctx.env.DB,m.family_id,sid,deleteNow),
    ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(sid,m.family_id)
  );}
  for(const r of childItems.results){const iid=Number(r.id);statements.push(
    ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(iid),
    ...archiveItemCompletionStatements(ctx.env.DB,m.family_id,iid,deleteNow),
    ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(iid,m.family_id)
  );}
  statements.push(
    ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
    ...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,deleteNow),
    ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
  );
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  await ctx.env.DB.batch(statements);
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  return json({ok:true,redirect:'/app/tasks.php'});
}
