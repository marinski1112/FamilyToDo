-- Family Log's 7-day/month summaries only read active HOUSEWORK rows.
-- Keep the index narrow so other Family Log writes do not populate it.
CREATE INDEX IF NOT EXISTS idx_family_logs_housework_range
ON family_logs(family_id, occurred_at)
WHERE log_type='HOUSEWORK' AND deleted_at IS NULL;
