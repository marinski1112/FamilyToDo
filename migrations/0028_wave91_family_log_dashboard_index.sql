-- Wave91: one partial covering index for active, subject-scoped dashboard aggregation.
-- Family-wide history continues to use idx_family_logs_family_occurred.
CREATE INDEX IF NOT EXISTS idx_family_logs_active_subject_type_occurred
ON family_logs(family_id, subject_id, log_type, occurred_at)
WHERE deleted_at IS NULL;
