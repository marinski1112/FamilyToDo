-- Family Log baby-food photo attachment foundation.
-- Media bytes stay in private MEDIA/R2; this table stores internal metadata only.

CREATE TABLE IF NOT EXISTS family_log_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    log_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    UNIQUE (log_id),
    UNIQUE (storage_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (log_id) REFERENCES family_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_family_log_media_family_log
ON family_log_media(family_id, log_id);

CREATE TRIGGER IF NOT EXISTS trg_family_log_media_insert_scope
BEFORE INSERT ON family_log_media
FOR EACH ROW
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM family_logs l
        JOIN family_log_subjects s
          ON s.id = l.subject_id
         AND s.family_id = l.family_id
        WHERE l.id = NEW.log_id
          AND l.family_id = NEW.family_id
          AND l.subject_id = NEW.subject_id
          AND l.deleted_at IS NULL
          AND l.log_type = 'MEAL'
          AND l.detail_code = 'BABY_FOOD'
          AND s.subject_kind IN ('BABY','CHILD')
    ) THEN RAISE(ABORT, 'family_log_media parent scope mismatch') END;
    SELECT CASE WHEN NEW.created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM members m
        WHERE m.id = NEW.created_by
          AND m.family_id = NEW.family_id
    ) THEN RAISE(ABORT, 'family_log_media creator scope mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_family_log_media_update_scope
BEFORE UPDATE OF family_id,log_id,subject_id,created_by ON family_log_media
FOR EACH ROW
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM family_logs l
        JOIN family_log_subjects s
          ON s.id = l.subject_id
         AND s.family_id = l.family_id
        WHERE l.id = NEW.log_id
          AND l.family_id = NEW.family_id
          AND l.subject_id = NEW.subject_id
          AND l.deleted_at IS NULL
          AND l.log_type = 'MEAL'
          AND l.detail_code = 'BABY_FOOD'
          AND s.subject_kind IN ('BABY','CHILD')
    ) THEN RAISE(ABORT, 'family_log_media parent scope mismatch') END;
    SELECT CASE WHEN NEW.created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM members m
        WHERE m.id = NEW.created_by
          AND m.family_id = NEW.family_id
    ) THEN RAISE(ABORT, 'family_log_media creator scope mismatch') END;
END;
