-- Family Log baby-food photo attachment foundation.
-- Media bytes stay in private MEDIA/R2; these tables store internal metadata and retryable cleanup state only.

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
    reconcile_pending INTEGER NOT NULL DEFAULT 0,
    UNIQUE (log_id),
    UNIQUE (storage_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (log_id) REFERENCES family_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS family_log_media_cleanup_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT NULL,
    UNIQUE (storage_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_family_log_media_family_log
ON family_log_media(family_id, log_id);
CREATE INDEX IF NOT EXISTS idx_family_log_media_reconcile
ON family_log_media(family_id, reconcile_pending, id);
CREATE INDEX IF NOT EXISTS idx_family_log_media_cleanup_queue
ON family_log_media_cleanup_queue(family_id, id);

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

-- Parent edits/soft-deletes become durable reconciliation requests even when the mutation happens outside the normal Family Log API (for example import rollback).
CREATE TRIGGER IF NOT EXISTS trg_family_log_media_parent_reconcile
AFTER UPDATE OF deleted_at,subject_id,log_type,detail_code ON family_logs
FOR EACH ROW
WHEN OLD.deleted_at IS NOT NEW.deleted_at
  OR OLD.subject_id IS NOT NEW.subject_id
  OR OLD.log_type IS NOT NEW.log_type
  OR OLD.detail_code IS NOT NEW.detail_code
BEGIN
    UPDATE family_log_media
       SET reconcile_pending=1
     WHERE family_id=NEW.family_id AND log_id=NEW.id;
END;

-- Subject-kind changes can make an existing BABY_FOOD attachment ineligible without touching the parent log row.
CREATE TRIGGER IF NOT EXISTS trg_family_log_media_subject_reconcile
AFTER UPDATE OF subject_kind ON family_log_subjects
FOR EACH ROW
WHEN OLD.subject_kind IS NOT NEW.subject_kind
BEGIN
    UPDATE family_log_media
       SET reconcile_pending=1
     WHERE family_id=NEW.family_id AND subject_id=NEW.id;
END;
