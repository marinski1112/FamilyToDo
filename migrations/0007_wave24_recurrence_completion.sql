-- Wave24: 定期タスク発生日ごとの担当者別完了状態
CREATE TABLE IF NOT EXISTS recurrence_occurrence_completions (
    occurrence_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (occurrence_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_recurrence_occ_completion_member
    ON recurrence_occurrence_completions(member_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_recurrence_occ_completion_occurrence
    ON recurrence_occurrence_completions(occurrence_id);
