-- Wave89: resumable chunk state for large Family Log imports.
ALTER TABLE family_log_import_batches ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE family_log_import_batches ADD COLUMN processed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE family_log_import_batches ADD COLUMN failed_at TEXT NULL;
ALTER TABLE family_log_import_batches ADD COLUMN completed_at TEXT NULL;
CREATE INDEX idx_family_log_import_batches_status ON family_log_import_batches(family_id,status,created_at);
