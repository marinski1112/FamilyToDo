-- AI rough-input / manual task hierarchy foundation.
-- This migration is additive only: existing tasks remain top-level because parent_task_id defaults to NULL.
-- Child completion, assignees, recurrence and schedule remain owned by each task row independently.
-- Deleting a parent detaches children instead of deleting them.

ALTER TABLE tasks
  ADD COLUMN parent_task_id INTEGER NULL
  REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_family_parent
  ON tasks(family_id, parent_task_id);
