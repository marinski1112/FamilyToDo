import type { AppContext } from './app-context';
import { logActivity } from './activity-log';
import { json } from './response';
import { commitSession } from './session';
import { taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;

type ChildPolicy='complete'|'promote';

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace('T',' ');

const fail=(error:string,status=400,code='BAD_REQUEST')=>json({ok:false,error,code},status);

/**
 * Parent-task completion boundary.
 *
 * The read-only `inspect` action lets the client decide whether it needs the
 * explicit child policy. The `complete` action mutates the parent completion
 * ledger and applies the selected direct-child policy in one D1 batch.
 */
export async function taskParentCompletionApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return fail('ログインが必要です。',401,'AUTH_REQUIRED');
  if(request.method!=='POST')return fail('POST only',405,'METHOD_NOT_ALLOWED');

  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body)return fail('JSONが不正です。');
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))return fail('CSRF検証に失敗しました。',403,'FORBIDDEN');

  const id=Number(body.id||0);
  if(!id)return fail('タスクが不正です。');
  const task=await ctx.env.DB.prepare(`SELECT t.id,t.status,t.completion_mode,t.task_kind
    FROM tasks t WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1`)
    .bind(id,member.family_id,member.id).first<Row>();
  if(!task)return fail('タスクが見つかりません。',404,'NOT_FOUND');
  if(String(task.task_kind||'').toLowerCase()==='event')return fail('イベントは完了チェックの対象外です。',409,'EVENT_NOT_COMPLETABLE');

  const childResult=await ctx.env.DB.prepare(`SELECT id FROM tasks
    WHERE family_id=? AND parent_task_id=? AND status<>'completed'
    ORDER BY sort_order,id`).bind(member.family_id,id).all<Row>();
  const incompleteChildren=(childResult.results||[]).map(row=>Number(row.id||0)).filter(childId=>childId>0);
  const action=String(body.action||'inspect');
  if(action==='inspect')return commitSession(json({ok:true,incomplete_children:incompleteChildren.length}),ctx.session,ctx.env.APP_SECRET);
  if(action!=='complete')return fail('未対応の操作です。');

  const policy=String(body.child_policy||'') as ChildPolicy;
  if(incompleteChildren.length>0&&policy!=='complete'&&policy!=='promote'){
    return json({ok:false,error:'未完了の子タスクの扱いを選択してください。',code:'PARENT_CHILD_POLICY_REQUIRED',incomplete_children:incompleteChildren.length},409);
  }

  const actorDone=await ctx.env.DB.prepare('SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1').bind(id,member.id).first<Row>();
  const done=await ctx.env.DB.prepare(`SELECT COUNT(*) c FROM task_completions tc
      JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?`).bind(member.family_id,id).first<Row>();
  const nextDone=Number(done?.c||0)+(actorDone?0:1);
  const taskComplete=nextDone>0;
  const now=nowJst();
  const statements=[];

  if(!actorDone){
    statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO task_completions(task_id,member_id,completed_at)
      VALUES(?,?,?)`).bind(id,member.id,now));
    statements.push(ctx.env.DB.prepare(`UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=?
      WHERE id=? AND family_id=?`).bind(taskComplete?'completed':'pending',taskComplete?member.id:null,taskComplete?now:null,now,id,member.family_id));
    statements.push(ctx.env.DB.prepare(`INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)
      VALUES(?,?,?,?)`).bind(id,member.id,'COMPLETED',now));
    if(taskComplete)statements.push(ctx.env.DB.prepare(`UPDATE notifications SET status='cancelled',updated_at=?
      WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')`).bind(now,id,member.family_id));
  }

  if(taskComplete&&incompleteChildren.length>0&&policy==='promote'){
    statements.push(ctx.env.DB.prepare(`UPDATE tasks SET parent_task_id=NULL,updated_at=?
      WHERE family_id=? AND parent_task_id=? AND status<>'completed'`).bind(now,member.family_id,id));
  }

  if(taskComplete&&incompleteChildren.length>0&&policy==='complete'){
    for(const childId of incompleteChildren){
      statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO task_completions(task_id,member_id,completed_at)
        VALUES(?,?,?)`).bind(childId,member.id,now));
      statements.push(ctx.env.DB.prepare(`UPDATE tasks SET status='completed',completed_by=?,completed_at=?,updated_at=?
        WHERE id=? AND family_id=? AND status<>'completed'`).bind(member.id,now,now,childId,member.family_id));
      statements.push(ctx.env.DB.prepare(`UPDATE notifications SET status='cancelled',updated_at=?
        WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')`).bind(now,childId,member.family_id));
      statements.push(ctx.env.DB.prepare(`INSERT INTO task_completion_history(task_id,member_id,action,occurred_at)
        VALUES(?,?,?,?)`).bind(childId,member.id,'COMPLETED',now));
    }
  }

  if(statements.length)await ctx.env.DB.batch(statements);
  if(!actorDone)await logActivity(ctx,'COMPLETED','task',id,{status:taskComplete?'completed':'pending',child_policy:taskComplete&&incompleteChildren.length?policy:null});
  if(taskComplete&&policy==='complete'){
    for(const childId of incompleteChildren)await logActivity(ctx,'COMPLETED','task',childId,{status:'completed',source:'parent_completion',parent_task_id:id});
  }

  return commitSession(json({
    ok:true,
    status:taskComplete?'completed':'pending',
    child_policy:taskComplete&&incompleteChildren.length?policy:null,
    affected_children:taskComplete?incompleteChildren.length:0,
  }),ctx.session,ctx.env.APP_SECRET);
}
