/**
 * Shared archive statements for destructive lifecycle operations.
 * These helpers only archive/delete completion state; callers remain responsible
 * for assignee rows, entity rows, recurrence links, notifications, and permissions.
 */
export function archiveTaskCompletionStatements(db:any,familyId:number,taskId:number,archivedAt:string):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'task', task_id, member_id, action, occurred_at, 'task', task_id, ? FROM task_completion_history WHERE task_id=?").bind(familyId,archivedAt,taskId),
    db.prepare('DELETE FROM task_completion_history WHERE task_id=?').bind(taskId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'task', task_id, member_id, 'COMPLETED', completed_at, 'task_legacy_completion', task_id, ? FROM task_completions WHERE task_id=?").bind(familyId,archivedAt,taskId),
    db.prepare('DELETE FROM task_completions WHERE task_id=?').bind(taskId),
  ];
}

export function archiveShoppingCompletionStatements(db:any,familyId:number,shoppingId:number,archivedAt:string):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'shopping', shopping_item_id, member_id, action, occurred_at, 'shopping_item', shopping_item_id, ? FROM shopping_completion_history WHERE shopping_item_id=?").bind(familyId,archivedAt,shoppingId),
    db.prepare('DELETE FROM shopping_completion_history WHERE shopping_item_id=?').bind(shoppingId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'shopping', shopping_item_id, member_id, 'COMPLETED', completed_at, 'shopping_legacy_completion', shopping_item_id, ? FROM shopping_completions WHERE shopping_item_id=?").bind(familyId,archivedAt,shoppingId),
    db.prepare('DELETE FROM shopping_completions WHERE shopping_item_id=?').bind(shoppingId),
  ];
}

export function archiveItemCompletionStatements(db:any,familyId:number,itemId:number,archivedAt:string):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', item_id, member_id, action, occurred_at, 'item', item_id, ? FROM item_completion_history WHERE item_id=?").bind(familyId,archivedAt,itemId),
    db.prepare('DELETE FROM item_completion_history WHERE item_id=?').bind(itemId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', item_id, member_id, 'COMPLETED', completed_at, 'item_legacy_completion', item_id, ? FROM item_completions WHERE item_id=?").bind(familyId,archivedAt,itemId),
    db.prepare('DELETE FROM item_completions WHERE item_id=?').bind(itemId),
  ];
}


/**
 * Archive completion state for every shopping/carry child currently attached to a task.
 * The parent/child entity rows themselves are NOT deleted here.
 */
export function archiveTaskChildCompletionStatements(db:any,familyId:number,taskId:number,archivedAt:string):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'shopping', h.shopping_item_id, h.member_id, h.action, h.occurred_at, 'shopping_item', h.shopping_item_id, ? FROM shopping_completion_history h JOIN shopping_items s ON s.id=h.shopping_item_id AND s.family_id=? WHERE s.task_id=?").bind(familyId,archivedAt,familyId,taskId),
    db.prepare('DELETE FROM shopping_completion_history WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(taskId,familyId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'shopping', c.shopping_item_id, c.member_id, 'COMPLETED', c.completed_at, 'shopping_legacy_completion', c.shopping_item_id, ? FROM shopping_completions c JOIN shopping_items s ON s.id=c.shopping_item_id AND s.family_id=? WHERE s.task_id=?").bind(familyId,archivedAt,familyId,taskId),
    db.prepare('DELETE FROM shopping_completions WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(taskId,familyId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', h.item_id, h.member_id, h.action, h.occurred_at, 'item', h.item_id, ? FROM item_completion_history h JOIN items i ON i.id=h.item_id AND i.family_id=? WHERE i.task_id=?").bind(familyId,archivedAt,familyId,taskId),
    db.prepare('DELETE FROM item_completion_history WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(taskId,familyId),
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', c.item_id, c.member_id, 'COMPLETED', c.completed_at, 'item_legacy_completion', c.item_id, ? FROM item_completions c JOIN items i ON i.id=c.item_id AND i.family_id=? WHERE i.task_id=?").bind(familyId,archivedAt,familyId,taskId),
    db.prepare('DELETE FROM item_completions WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(taskId,familyId),
  ];
}

/**
 * Archive completion state for every materialized occurrence belonging to a recurrence rule,
 * then remove the operational occurrence completion rows and occurrence cache rows.
 * The recurrence_rules row itself is intentionally left for the caller to delete/update.
 */
export function archiveRecurrenceRuleOccurrenceStatements(db:any,familyId:number,ruleId:number,archivedAt:string,sourceType='recurrence_occurrence'):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', c.occurrence_id, c.member_id, 'COMPLETED', c.completed_at, ?, c.occurrence_id, ? FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id AND o.family_id=? WHERE o.recurrence_rule_id=?").bind(familyId,sourceType,archivedAt,familyId,ruleId),
    db.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id IN (SELECT id FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?)').bind(ruleId,familyId),
    db.prepare('DELETE FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?').bind(ruleId,familyId),
  ];
}

/** Archive and clear completion rows for one recurrence occurrence without deleting the occurrence. */
export function archiveRecurrenceOccurrenceCompletionStatements(db:any,familyId:number,occurrenceId:number,archivedAt:string,sourceType='recurrence_occurrence'):any[]{
  return [
    db.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', occurrence_id, member_id, 'COMPLETED', completed_at, ?, occurrence_id, ? FROM recurrence_occurrence_completions WHERE occurrence_id=?").bind(familyId,sourceType,archivedAt,occurrenceId),
    db.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=?').bind(occurrenceId),
  ];
}
