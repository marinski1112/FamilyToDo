-- The app now treats a completion from any active family member as complete.
-- Keep completion rows, histories, completed_by and all live Task relations.
UPDATE tasks SET completion_mode='ANY' WHERE completion_mode<>'ANY';

DROP TABLE IF EXISTS task_assignees;
DROP TABLE IF EXISTS item_assignees;
DROP TABLE IF EXISTS shopping_assignees;

DROP INDEX IF EXISTS idx_items_task;
DROP INDEX IF EXISTS idx_shopping_task;
DROP INDEX IF EXISTS idx_shopping_overdue_linked_seek;
DROP INDEX IF EXISTS idx_shopping_overdue_unlinked_seek;
DROP INDEX IF EXISTS idx_shopping_undated_status_completed_at;

-- Migration 0100 already copied inherited due dates and detached these links.
ALTER TABLE items DROP COLUMN task_id;
ALTER TABLE shopping_items DROP COLUMN task_id;

CREATE INDEX IF NOT EXISTS idx_shopping_overdue_seek
  ON shopping_items(family_id,due_date,(category IS NOT NULL),COALESCE(category,''),name,id)
  WHERE status<>'completed' AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shopping_undated_status_completed_at
  ON shopping_items(family_id,status,completed_at)
  WHERE due_date IS NULL;
