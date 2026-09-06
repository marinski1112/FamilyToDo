-- Family Log baby-food photo attachment foundation.
-- Media bytes stay in private MEDIA/R2; these tables store internal metadata and retryable cleanup state only.
--
-- IMPORTANT: Keep this migration free of CREATE TRIGGER bodies. Wrangler remote D1 migration
-- statement splitting can submit an incomplete CREATE TRIGGER body and fail with SQLITE_ERROR 7500.
-- Parent/subject eligibility is enforced by the authenticated application boundaries, and imports
-- explicitly mark family media for reconciliation before draining cleanup work.

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
    purpose TEXT NOT NULL CHECK (purpose IN ('ORPHAN','DELETE')),
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

-- Defensive cleanup in case an earlier failed remote attempt managed to create any trigger before
-- failing. These are simple standalone statements and leave lifecycle reconciliation owned by code.
DROP TRIGGER IF EXISTS trg_family_log_media_insert_scope;
DROP TRIGGER IF EXISTS trg_family_log_media_update_scope;
DROP TRIGGER IF EXISTS trg_family_log_media_parent_reconcile;
DROP TRIGGER IF EXISTS trg_family_log_media_subject_reconcile;
