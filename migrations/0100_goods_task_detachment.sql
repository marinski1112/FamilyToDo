-- Retire the legacy goods -> task relation after goods-owned visibility is established.
-- Preserve every goods row, completion snapshot/history and activity history.
-- Carry the task's effective deadline onto the goods row only when the goods row
-- does not already have its own deadline. Only same-family parents are trusted.

UPDATE shopping_items
SET due_date=COALESCE(
  NULLIF(trim(COALESCE(due_date,'')),''),
  substr((
    SELECT COALESCE(NULLIF(t.end_at,''),NULLIF(t.due_at,''),NULLIF(t.start_at,''))
    FROM tasks t
    WHERE t.id=shopping_items.task_id AND t.family_id=shopping_items.family_id
    LIMIT 1
  ),1,10)
)
WHERE task_id IS NOT NULL
  AND EXISTS(
    SELECT 1 FROM tasks t
    WHERE t.id=shopping_items.task_id AND t.family_id=shopping_items.family_id
  );

UPDATE items
SET due_at=COALESCE(
  NULLIF(trim(COALESCE(due_at,'')),''),
  (
    SELECT COALESCE(NULLIF(t.end_at,''),NULLIF(t.due_at,''),NULLIF(t.start_at,''))
    FROM tasks t
    WHERE t.id=items.task_id AND t.family_id=items.family_id
    LIMIT 1
  )
)
WHERE task_id IS NOT NULL
  AND EXISTS(
    SELECT 1 FROM tasks t
    WHERE t.id=items.task_id AND t.family_id=items.family_id
  );

-- Detach valid, missing and cross-family legacy links alike. Visibility was already
-- snapshotted by 0099, so no privacy decision depends on task_id after this point.
UPDATE shopping_items SET task_id=NULL WHERE task_id IS NOT NULL;
UPDATE items SET task_id=NULL WHERE task_id IS NOT NULL;
