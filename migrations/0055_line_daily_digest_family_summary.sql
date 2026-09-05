-- LINE morning family digest: bounded presentation preferences and per-subject inclusion.
-- Existing subjects are included by default; rows are only needed to persist an explicit choice.
ALTER TABLE line_daily_digest_settings
ADD COLUMN tone_level TEXT NOT NULL DEFAULT 'FRIENDLY_LIGHT'
CHECK(tone_level IN ('PLAIN','FRIENDLY','FRIENDLY_LIGHT'));

CREATE TABLE line_daily_digest_subject_settings (
  family_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(family_id,subject_id),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES family_log_subjects(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX idx_line_digest_subject_family_enabled
ON line_daily_digest_subject_settings(family_id,enabled,subject_id);
