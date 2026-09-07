-- D1 scheduled hot-path indexes.
-- Additive only: existing indexes remain untouched for compatibility with other query paths.

-- Five-minute notification delivery only needs unsent pending/retry rows ordered by due time.
-- The partial predicate matches the delivery query exactly and keeps completed/cancelled history out of the hot index.
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_due
ON notifications(notify_at,id)
WHERE sent_at IS NULL AND status IN ('pending','retry');

-- Daily 31-day retention is global by occurred_at; the older family-leading indexes
-- cannot seek this predicate without a family key.
CREATE INDEX IF NOT EXISTS idx_activity_logs_retention
ON activity_logs(occurred_at);

-- Send-time recurring-template validation probes a rule by task/family, then active/deleted state.
-- Existing lifecycle indexes lead with family_id or active and do not cover this lookup order.
CREATE INDEX IF NOT EXISTS idx_recurrence_rules_task_lifecycle
ON recurrence_rules(task_id,family_id,active,deleted_at);
