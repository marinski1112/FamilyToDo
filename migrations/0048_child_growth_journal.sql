-- Child Growth Journal foundation.
-- Journal entries remain canonical Family Log rows; this table only marks the
-- subset intentionally promoted into a long-lived journal/sync surface.

CREATE TABLE IF NOT EXISTS family_log_journal_entries (
  log_id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  journal_kind TEXT NOT NULL DEFAULT 'CHILD' CHECK (journal_kind IN ('CHILD','PET')),
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('MILESTONE','MEASUREMENT','MEMO')),
  milestone_code TEXT,
  google_sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK (google_sync_enabled IN (0,1)),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (log_id) REFERENCES family_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_family_log_journal_family_subject_date
  ON family_log_journal_entries(family_id,subject_id,log_id);

CREATE TRIGGER IF NOT EXISTS trg_family_log_journal_tenant_insert
BEFORE INSERT ON family_log_journal_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM family_logs l
  JOIN family_log_subjects s ON s.id=NEW.subject_id
  WHERE l.id=NEW.log_id
    AND l.family_id=NEW.family_id
    AND l.subject_id=NEW.subject_id
    AND s.family_id=NEW.family_id
    AND s.subject_kind IN ('BABY','CHILD','PET')
)
BEGIN
  SELECT RAISE(ABORT, 'family_log_journal_tenant_mismatch');
END;
