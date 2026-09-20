/** Goods privacy belongs to the item, never its assignees or a task.
 * Callers must also enforce their authenticated family boundary.
 * A PRIVATE row with a missing owner fails closed, including after owner deletion.
 */
export function goodsVisibilitySql(alias:string):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('invalid goods SQL alias');
  return `(${alias}.visibility_scope='FAMILY' OR (${alias}.visibility_scope='PRIVATE' AND ${alias}.private_owner_id=?))`;
}

/** Shared outputs (sets, family messages and summaries) exclude all private goods,
 * even if the actor happens to be their owner. No role-based bypass.
 */
export function sharedGoodsSql(alias:string):string{
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('invalid goods SQL alias');
  return `${alias}.visibility_scope='FAMILY'`;
}
