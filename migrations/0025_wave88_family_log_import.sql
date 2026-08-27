-- Wave88: normalized, preview-first Family Log imports and reversible provenance.
CREATE TABLE family_log_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_filename TEXT NULL,
  source_hash TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  rolled_back_at TEXT NULL,
  rolled_back_by INTEGER NULL,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE RESTRICT,
  FOREIGN KEY (rolled_back_by) REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX idx_family_log_import_batches_family_created ON family_log_import_batches(family_id,created_at DESC,id DESC);
CREATE INDEX idx_family_log_import_batches_source_hash ON family_log_import_batches(family_id,subject_id,source,source_hash);

ALTER TABLE family_logs ADD COLUMN import_batch_id INTEGER NULL REFERENCES family_log_import_batches(id) ON DELETE SET NULL;
ALTER TABLE family_logs ADD COLUMN import_source_key TEXT NULL;
ALTER TABLE family_logs ADD COLUMN import_source_text TEXT NULL;
ALTER TABLE family_logs ADD COLUMN import_source_page INTEGER NULL;
ALTER TABLE family_logs ADD COLUMN import_external_id TEXT NULL;
CREATE INDEX idx_family_logs_import_batch ON family_logs(import_batch_id);
CREATE UNIQUE INDEX uq_family_logs_active_import_key
  ON family_logs(family_id,subject_id,import_source_key)
  WHERE import_source_key IS NOT NULL AND deleted_at IS NULL;
