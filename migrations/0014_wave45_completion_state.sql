-- Wave45: completion state transition hardening.
-- The application uses ON CONFLICT(entity_id, member_id) for operational completion snapshots.
-- Legacy tables did not enforce that invariant, so deduplicate first and then add unique indexes.
DELETE FROM task_completions
WHERE id IN (
  SELECT old.id FROM task_completions old
  JOIN task_completions newer
    ON newer.task_id=old.task_id
   AND newer.member_id=old.member_id
   AND newer.id>old.id
);

DELETE FROM item_completions
WHERE id IN (
  SELECT old.id FROM item_completions old
  JOIN item_completions newer
    ON newer.item_id=old.item_id
   AND newer.member_id=old.member_id
   AND newer.id>old.id
);

DELETE FROM shopping_completions
WHERE id IN (
  SELECT old.id FROM shopping_completions old
  JOIN shopping_completions newer
    ON newer.shopping_item_id=old.shopping_item_id
   AND newer.member_id=old.member_id
   AND newer.id>old.id
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_completion_member
  ON task_completions(task_id, member_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_completion_member
  ON item_completions(item_id, member_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_shopping_completion_member
  ON shopping_completions(shopping_item_id, member_id);

CREATE INDEX IF NOT EXISTS idx_deleted_completion_member_time
  ON deleted_completion_history(family_id, member_id, archived_at);
