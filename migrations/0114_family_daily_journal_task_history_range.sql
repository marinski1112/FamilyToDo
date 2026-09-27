-- The 10 JST seven-day repair reads completion events by occurred_at day.
-- Keep the original task/member indexes for per-task completion operations.
CREATE INDEX IF NOT EXISTS idx_task_history_occurred_journal
  ON task_completion_history(occurred_at, task_id, member_id);
