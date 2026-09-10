-- Durable family-day retrospective built from bounded domain projections.
-- The journal is intentionally independent from raw Location retention so it can
-- survive later database maintenance/cold archival. Private task titles are never
-- eligible for this family-wide projection.

CREATE TABLE IF NOT EXISTS family_daily_journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  journal_date TEXT NOT NULL CHECK (journal_date GLOB '????-??-??'),
  summary_text TEXT NOT NULL DEFAULT '',
  location_json TEXT NOT NULL DEFAULT '[]',
  tasks_json TEXT NOT NULL DEFAULT '[]',
  housework_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  storage_tier TEXT NOT NULL DEFAULT 'HOT' CHECK (storage_tier IN ('HOT','COLD')),
  archive_object_key TEXT,
  archived_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  UNIQUE (family_id, journal_date),
  CHECK (
    (storage_tier='HOT' AND archive_object_key IS NULL AND archived_at IS NULL)
    OR
    (storage_tier='COLD' AND archive_object_key IS NOT NULL AND archived_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_family_daily_journals_family_date
  ON family_daily_journals(family_id, journal_date DESC);

CREATE INDEX IF NOT EXISTS idx_family_daily_journals_storage
  ON family_daily_journals(storage_tier, journal_date);
