-- Wave108: provenance-only ICS import batches and stable source identity. Raw ICS is never stored.
CREATE TABLE calendar_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  source_format TEXT NOT NULL CHECK(source_format='ICS'), source_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL, timezone TEXT, status TEXT NOT NULL CHECK(status IN ('IMPORTING','COMPLETED','ROLLED_BACK','FAILED')),
  total_count INTEGER NOT NULL, created_count INTEGER NOT NULL DEFAULT 0, updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0, error_count INTEGER NOT NULL DEFAULT 0, processed_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES members(id), created_at TEXT NOT NULL, applied_at TEXT, rolled_back_at TEXT
);
CREATE INDEX idx_calendar_import_batches_family ON calendar_import_batches(family_id,created_at);
CREATE TABLE calendar_import_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES calendar_import_batches(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE, source_format TEXT NOT NULL CHECK(source_format='ICS'),
  source_uid TEXT NOT NULL, source_recurrence_id TEXT, source_recurrence_key TEXT NOT NULL DEFAULT '', source_hash TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL, recurrence_rule_id INTEGER REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  related_to_uid TEXT, source_created TEXT, source_last_modified TEXT, imported_task_updated_at TEXT, imported_rule_updated_at TEXT,
  imported_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','ROLLED_BACK','EDITED_KEPT','MISSING')),
  UNIQUE(family_id,source_format,source_uid,source_recurrence_key)
);
CREATE INDEX idx_calendar_import_entries_batch ON calendar_import_entries(batch_id,status);
