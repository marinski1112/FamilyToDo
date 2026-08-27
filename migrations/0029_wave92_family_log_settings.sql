-- Wave92: family-level Family Log display preferences. This is visibility only;
-- subjects, logs, member linkage and import provenance remain untouched.
CREATE TABLE family_log_settings (
  family_id INTEGER PRIMARY KEY,
  show_adult_logs INTEGER NOT NULL DEFAULT 1 CHECK (show_adult_logs IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);
