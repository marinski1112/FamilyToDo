type Task = {id?:unknown;parent_task_id?:unknown};

/** One parent with children counts its children, not an extra parent row. */
export function countCalendarChecklistTasks(rows:Task[],undatedChildren:Task[]):number{
  const datedChildren=new Set(rows.filter(row=>Number(row.parent_task_id||0)>0).map(row=>Number(row.parent_task_id)));
  const undatedByParent=new Map<number,number>();
  for(const child of undatedChildren)undatedByParent.set(Number(child.parent_task_id),(undatedByParent.get(Number(child.parent_task_id))||0)+1);
  return rows.filter(row=>Number(row.parent_task_id||0)>0||(!datedChildren.has(Number(row.id))&&!undatedByParent.has(Number(row.id)))).length
    +rows.filter(row=>!Number(row.parent_task_id||0)).reduce((sum,row)=>sum+(undatedByParent.get(Number(row.id))||0),0);
}
