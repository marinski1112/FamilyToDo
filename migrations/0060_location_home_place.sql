-- Family-scoped Location place foundation.
-- HOME is an explicit admin-managed static destination captured from an existing
-- sharing-enabled FamilyToDo Location point. No raw provider payload is stored.

CREATE TABLE IF NOT EXISTS family_location_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('HOME')),
  label TEXT NOT NULL DEFAULT '自宅' CHECK (length(trim(label)) BETWEEN 1 AND 40),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  accuracy_meters REAL CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  captured_from_member_id INTEGER,
  source_recorded_at TEXT,
  created_by_member_id INTEGER,
  updated_by_member_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (captured_from_member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_member_id) REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE (family_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_family_location_places_family_kind
  ON family_location_places(family_id, kind);
