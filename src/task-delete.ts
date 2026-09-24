import { json, redirect } from './response';
import { archiveTaskCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { queueCalendarProjectionAfterMutation } from './google-calendar';
import { taskVisibilitySql } from './task-visibility';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function taskDelete(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST'&&request.method!=='DELETE') return json({ok:false,error:'POST/DELETE only'},405);
  const m=ctx.member;if(!m)return redirect('/login.php');
  const id=Number(new URL(request.url).searchParams.get('id')||0) || Number((await request.clone().json().catch(()=>({}))).id||0);
  if(!id)return json({ok:false,error:'idが不正です。'},400);
  const body=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
  const csrf=request.headers.get('x-csrf')||String(body.csrf||'');
  if(csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const task=await ctx.env.DB.prepare(`SELECT created_by,task_kind FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`).bind(id,m.family_id,m.id).first();
  if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
  const exceptionOrigin=await ctx.env.DB.prepare('SELECT o.id,o.recurrence_rule_id,o.occurrence_date FROM recurrence_occurrences o WHERE o.exception_task_id=? AND o.family_id=? LIMIT 1').bind(id,m.family_id).first();
  const exceptionMode=String(new URL(request.url).searchParams.get('exception_mode')||'');
  if(exceptionOrigin&&!['restore','exclude'].includes(exceptionMode))return json({ok:false,error:'このタスクは定期タスクの例外です。削除後の扱いを選択してください。'},400);
  let restoredStatus='pending',restoredBy:null|number=null,restoredAt:null|string=null;
  if(exceptionOrigin&&exceptionMode==='restore'){
    const last=await ctx.env.DB.prepare('SELECT c.member_id,c.completed_at FROM recurrence_occurrence_completions c JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1 WHERE c.occurrence_id=? ORDER BY c.completed_at DESC LIMIT 1').bind(m.family_id,Number(exceptionOrigin.id)).first();
    const complete=Boolean(last);
    if(complete){restoredStatus='completed';restoredBy=Number(last?.member_id||0)||null;restoredAt=String(last?.completed_at||'')||null;}
  }
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
  statements.push(
    ...archiveTaskCompletionStatements(ctx.env.DB,m.family_id,id,deleteNow),
    ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
  );
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  await ctx.env.DB.batch(statements);
  await queueCalendarProjectionAfterMutation(ctx.env.DB,m.family_id,id);
  return json({ok:true,redirect:'/app/tasks.php'});
}
