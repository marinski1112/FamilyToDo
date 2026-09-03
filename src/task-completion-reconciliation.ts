/**
 * Recompute an ordinary task's aggregate completion after its assignee set changes.
 * Explicit assignees retain the stored ANY/ALL rule. With zero active assignees,
 * completion falls back to any active member in the same family, matching /api/toggle.
 */
export async function reconcileTaskCompletionAfterAssigneeChange(
  DB:any,
  familyId:number,
  taskId:number,
  now:string,
):Promise<void>{
  const task=await DB.prepare('SELECT completion_mode FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(taskId,familyId).first();
  if(!task)return;

  const assigned=await DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(taskId).first();
  const assignedCount=Number(assigned?.c||0);

  if(assignedCount>0){
    await DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT ta.member_id FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?)').bind(taskId,taskId).run();
  }else{
    await DB.prepare('DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN (SELECT id FROM members WHERE family_id=? AND active=1)').bind(taskId,familyId).run();
  }

  const done=assignedCount>0
    ?await DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=?').bind(taskId).first()
    :await DB.prepare('SELECT COUNT(*) c FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=?').bind(familyId,taskId).first();
  const mode=assignedCount>0?String(task.completion_mode||'ANY').toUpperCase():'ANY';
  const isComplete=mode==='ALL'?assignedCount>0&&Number(done?.c||0)>=assignedCount:Number(done?.c||0)>0;
  const latest=isComplete
    ?assignedCount>0
      ?await DB.prepare('SELECT tc.member_id,tc.completed_at FROM task_completions tc JOIN task_assignees ta ON ta.task_id=tc.task_id AND ta.member_id=tc.member_id JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE tc.task_id=? ORDER BY tc.completed_at DESC,tc.member_id DESC LIMIT 1').bind(taskId).first()
      :await DB.prepare('SELECT tc.member_id,tc.completed_at FROM task_completions tc JOIN members am ON am.id=tc.member_id AND am.family_id=? AND am.active=1 WHERE tc.task_id=? ORDER BY tc.completed_at DESC,tc.member_id DESC LIMIT 1').bind(familyId,taskId).first()
    :null;

  await DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?')
    .bind(isComplete?'completed':'pending',isComplete?(Number(latest?.member_id||0)||null):null,isComplete?String(latest?.completed_at||now):null,now,taskId,familyId).run();
}
