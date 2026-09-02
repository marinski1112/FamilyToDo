import type { AppContext } from './app-context';
import { logActivity } from './activity-log';

type Row=Record<string,unknown>;

export type FamilyLogLinkedCompletionResult={
  ok:boolean;
  message:string;
  target_type?:'task'|'recurrence';
  target_id?:number;
  status?:string;
};

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

/**
 * Canonical retained service for projecting a Family Log record into the
 * completion state of its linked Task or recurring occurrence.
 *
 * The caller owns authentication and Family Log persistence. This service owns
 * assignee authorization, no-assignee self-assignment, ANY/ALL aggregation,
 * completion history, notification cancellation and privacy-safe activity log
 * projection for the linked completion only.
 */
export async function completeLinkedTargetFromFamilyLog(
  ctx:AppContext,
  linkedTaskId:number|null,
  linkedOccurrenceId:number|null,
  familyLogId:number,
):Promise<FamilyLogLinkedCompletionResult>{
  const m=ctx.member;
  if(!m)throw new Error('Family Log linked completion requires an authenticated member.');
  const now=nowJst();

  if(linkedTaskId){
    const task=await ctx.env.DB.prepare('SELECT id,status,completion_mode,task_kind FROM tasks WHERE id=? AND family_id=? LIMIT 1')
      .bind(linkedTaskId,m.family_id).first<Row>();
    if(!task)return {ok:false,message:'関連タスクが見つからないため自動完了しませんでした。'};
    if(String(task.task_kind||'').toLowerCase()==='event')return {ok:false,message:'イベントは完了対象外です。'};

    const already=await ctx.env.DB.prepare('SELECT 1 x FROM task_completions WHERE task_id=? AND member_id=? LIMIT 1')
      .bind(linkedTaskId,m.id).first<Row>();
    if(already)return {ok:true,message:'関連タスクはすでにこの記録者が完了済みです。',target_type:'task',target_id:linkedTaskId,status:String(task.status||'pending')};

    let assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?')
      .bind(linkedTaskId).first<Row>();
    let actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1')
      .bind(linkedTaskId,m.id).first<Row>();
    if(Number(assigned?.c||0)===0){
      await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)').bind(linkedTaskId,m.id).run();
      assigned={c:1};
      actorAssigned={x:1};
    }
    if(!actorAssigned)return {ok:false,message:'記録者が関連タスクの担当者ではないため、自動完了は行いませんでした。',target_type:'task',target_id:linkedTaskId};

    await ctx.env.DB.prepare('INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')
      .bind(linkedTaskId,m.id,now).run();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?')
      .bind(linkedTaskId).first<Row>();
    const shouldComplete=String(task.completion_mode||'ANY').toUpperCase()==='ALL'
      ? Number(done?.c||0)>=Number(assigned?.c||0)
      : Number(done?.c||0)>0;
    await ctx.env.DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?')
      .bind(shouldComplete?'completed':'pending',shouldComplete?m.id:null,shouldComplete?now:null,now,linkedTaskId,m.family_id).run();
    await ctx.env.DB.prepare('INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,?,?)')
      .bind(linkedTaskId,m.id,'COMPLETED',now).run();
    if(shouldComplete){
      await ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')")
        .bind(now,linkedTaskId,m.family_id).run();
    }
    await logActivity(ctx,'COMPLETED','task',linkedTaskId,{status:shouldComplete?'completed':'pending',source:'family_log',family_log_id:familyLogId});
    return {ok:true,message:'記録者を関連タスクの完了者として記録しました。',target_type:'task',target_id:linkedTaskId,status:shouldComplete?'completed':'pending'};
  }

  if(linkedOccurrenceId){
    const occ=await ctx.env.DB.prepare('SELECT o.id,o.recurrence_rule_id,r.task_id,r.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id WHERE o.id=? AND o.family_id=? LIMIT 1')
      .bind(linkedOccurrenceId,m.family_id).first<Row>();
    if(!occ)return {ok:false,message:'関連する定期タスク発生日が見つからないため自動完了しませんでした。'};
    const taskId=Number(occ.task_id||0);

    const already=await ctx.env.DB.prepare('SELECT 1 x FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=? LIMIT 1')
      .bind(linkedOccurrenceId,m.id).first<Row>();
    if(already)return {ok:true,message:'関連する定期タスク発生日はすでにこの記録者が完了済みです。',target_type:'recurrence',target_id:linkedOccurrenceId};

    let assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?')
      .bind(taskId).first<Row>();
    let actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1')
      .bind(taskId,m.id).first<Row>();
    if(Number(assigned?.c||0)===0){
      await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) VALUES(?,?)').bind(taskId,m.id).run();
      assigned={c:1};
      actorAssigned={x:1};
    }
    if(!actorAssigned)return {ok:false,message:'記録者が定期タスクの担当者ではないため、自動完了は行いませんでした。',target_type:'recurrence',target_id:linkedOccurrenceId};

    await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at')
      .bind(linkedOccurrenceId,m.id,now).run();
    const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions c JOIN task_assignees ta ON ta.member_id=c.member_id AND ta.task_id=? JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE c.occurrence_id=?')
      .bind(taskId,linkedOccurrenceId).first<Row>();
    const isComplete=String(occ.completion_mode||'ANY').toUpperCase()==='ALL'
      ? Number(done?.c||0)>=Number(assigned?.c||0)
      : Number(done?.c||0)>0;
    await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?')
      .bind(isComplete?'completed':'pending',isComplete?m.id:null,isComplete?now:null,now,linkedOccurrenceId,m.family_id).run();
    await logActivity(ctx,'COMPLETED','recurrence',linkedOccurrenceId,{occurrence_id:linkedOccurrenceId,rule_id:Number(occ.recurrence_rule_id||0),status:isComplete?'completed':'pending',source:'family_log',family_log_id:familyLogId});
    return {ok:true,message:'記録者を定期タスク発生日の完了者として記録しました。',target_type:'recurrence',target_id:linkedOccurrenceId,status:isComplete?'completed':'pending'};
  }

  return {ok:false,message:'関連タスクは指定されていません。'};
}
