-- Keep overdue Task paging in effective-deadline order without a temporary sort.
-- The partial predicate matches the canonical pending Task overdue query; Events,
-- recurrence templates, undated rows, and completed rows stay outside this index.
CREATE INDEX idx_tasks_overdue_seek
  ON tasks(family_id, COALESCE(end_at,due_at,start_at), id)
  WHERE status='pending'
    AND (task_kind IS NULL OR lower(task_kind)='task')
    AND COALESCE(end_at,due_at,start_at) IS NOT NULL;
