/** Keep Task aggregate state in sync with completions from any active family member.
 * Completion history is kept separately and is never removed by reconciliation. */
export async function reconcileTaskCompletionAfterAssigneeChange(
  DB:any,
  familyId:number,
  taskId:number,
  now:string,
):Promise<void>{
  const task=await DB.prepare('SELECT id FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(taskId,familyId).first();
  if(!task)return;
  const latest=await DB.prepare(`SELECT tc.member_id,tc.completed_at FROM task_completions tc
    JOIN members m ON m.id=tc.member_id AND m.family_id=? AND m.active=1
    WHERE tc.task_id=? ORDER BY tc.completed_at DESC,tc.member_id DESC LIMIT 1`).bind(familyId,taskId).first();
  await DB.prepare('UPDATE tasks SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?')
    .bind(latest?'completed':'pending',latest?Number(latest.member_id):null,latest?String(latest.completed_at||now):null,now,taskId,familyId).run();
}
