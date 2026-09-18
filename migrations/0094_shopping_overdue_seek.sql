-- Bound overdue Shopping reads by the current effective-deadline/category/name/id order.
-- Rows with their own due_date can seek directly in shopping_items. The legacy
-- parent-deadline fallback remains a separate branch because its effective due
-- lives on tasks rather than shopping_items and keeps using the existing due index.
CREATE INDEX idx_shopping_overdue_unlinked_seek
  ON shopping_items(family_id,due_date,(category IS NOT NULL),COALESCE(category,''),name,id)
  WHERE status<>'completed'
    AND task_id IS NULL
    AND due_date IS NOT NULL;

CREATE INDEX idx_shopping_overdue_linked_seek
  ON shopping_items(family_id,due_date,(category IS NOT NULL),COALESCE(category,''),name,id)
  WHERE status<>'completed'
    AND task_id IS NOT NULL
    AND due_date IS NOT NULL;
