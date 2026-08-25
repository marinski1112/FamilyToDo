-- Wave43: preserve structured completion history when operational records are deleted.
-- Archived rows intentionally have no foreign keys to the live entities so they survive deletion.
CREATE TABLE IF NOT EXISTS deleted_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    member_id INTEGER NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    source_type TEXT NULL,
    source_id INTEGER NULL,
    archived_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deleted_completion_family_time
    ON deleted_completion_history(family_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_deleted_completion_entity
    ON deleted_completion_history(family_id, entity_type, entity_id);
