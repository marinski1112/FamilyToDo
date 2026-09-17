-- Keep the no-deadline checklist read bounded to current pending/recently-completed rows.
-- completed_at is stored as a JST wall-clock timestamp (YYYY-MM-DD HH:MM:SS).
CREATE INDEX IF NOT EXISTS idx_shopping_undated_status_completed_at
ON shopping_items(family_id, status, completed_at)
WHERE task_id IS NULL AND due_date IS NULL;
