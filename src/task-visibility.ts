/**
 * Canonical retained task/item/shopping visibility predicates.
 *
 * Keep these helpers free of request/session/database dependencies so retained
 * feature modules can enforce the same FAMILY/PRIVATE contract without reaching
 * into the legacy app.ts monolith. app.ts still contains a temporary legacy
 * duplicate until it can be removed through a safe partial-edit extraction.
 */
type Row = Record<string, unknown>;

/** Central Wave83 predicate. There is deliberately no OWNER/ADMIN override. */
export function taskVisibilitySql(alias='t'):string {
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('invalid task SQL alias');
  return `(COALESCE(${alias}.visibility_scope,'FAMILY')='FAMILY' OR (${alias}.visibility_scope='PRIVATE' AND ${alias}.private_owner_id=?))`;
}

export function canAccessTask(task:Row|undefined|null,memberId:number):boolean {
  return Boolean(task)&&(String(task!.visibility_scope||'FAMILY')==='FAMILY'||(String(task!.visibility_scope)==='PRIVATE'&&Number(task!.private_owner_id)===memberId));
}

/** SQL predicate for item/shopping rows inheriting their parent task visibility. */
export function taskChildVisibilitySql(childAlias:string):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(childAlias))throw new Error('invalid child SQL alias');
  return `(${childAlias}.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks vt WHERE vt.id=${childAlias}.task_id AND vt.family_id=${childAlias}.family_id AND ${taskVisibilitySql('vt')}))`;
}

/** Activity logs are filtered against the current parent visibility. Each of
 * task/item/shopping contributes one member-id placeholder; no role override. */
export function activityLogVisibilitySql(logAlias='a'):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(logAlias))throw new Error('invalid activity log SQL alias');
  return `(${logAlias}.target_type NOT IN ('task','item','shopping')
    OR (${logAlias}.target_type='task' AND NOT EXISTS(SELECT 1 FROM tasks av_t WHERE av_t.id=${logAlias}.target_id AND av_t.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_t')}))
    OR (${logAlias}.target_type='item' AND NOT EXISTS(SELECT 1 FROM items av_i JOIN tasks av_it ON av_it.id=av_i.task_id AND av_it.family_id=av_i.family_id WHERE av_i.id=${logAlias}.target_id AND av_i.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_it')}))
    OR (${logAlias}.target_type='shopping' AND NOT EXISTS(SELECT 1 FROM shopping_items av_s JOIN tasks av_st ON av_st.id=av_s.task_id AND av_st.family_id=av_s.family_id WHERE av_s.id=${logAlias}.target_id AND av_s.family_id=${logAlias}.family_id AND NOT ${taskVisibilitySql('av_st')})))`;
}
