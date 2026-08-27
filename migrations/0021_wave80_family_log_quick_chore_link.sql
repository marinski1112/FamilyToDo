-- Wave80: retain the source quick-chore identity for future aggregation while
-- family_logs.value_text continues to hold the display-name snapshot.
ALTER TABLE family_logs ADD COLUMN quick_chore_id INTEGER NULL
  REFERENCES family_quick_chores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_family_logs_quick_chore
ON family_logs(family_id, quick_chore_id, occurred_at DESC)
WHERE deleted_at IS NULL AND quick_chore_id IS NOT NULL;
