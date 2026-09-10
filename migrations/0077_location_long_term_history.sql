-- Long-term Location summary archive.
-- Raw member_location_history remains the operational source until an explicit
-- future data-maintenance workflow safely removes or cold-archives it.
-- Archived rows intentionally omit provider payloads, credentials and detailed telemetry.

CREATE TABLE IF NOT EXISTS location_history_archive_days (
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  local_date TEXT NOT NULL CHECK (local_date GLOB '????-??-??'),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  raw_point_count INTEGER NOT NULL CHECK (raw_point_count >= 0),
  route_point_count INTEGER NOT NULL CHECK (route_point_count >= 0 AND route_point_count <= 72),
  route_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (family_id, member_id, local_date),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_history_archive_days_member_date
  ON location_history_archive_days(family_id, member_id, local_date DESC);

CREATE TABLE IF NOT EXISTS location_history_stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  local_date TEXT NOT NULL CHECK (local_date GLOB '????-??-??'),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  place_label TEXT NOT NULL CHECK (length(trim(place_label)) BETWEEN 1 AND 120),
  address_label TEXT CHECK (address_label IS NULL OR length(trim(address_label)) BETWEEN 1 AND 120),
  anchor_latitude REAL CHECK (anchor_latitude IS NULL OR anchor_latitude BETWEEN -90.0 AND 90.0),
  anchor_longitude REAL CHECK (anchor_longitude IS NULL OR anchor_longitude BETWEEN -180.0 AND 180.0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE (family_id, member_id, started_at, ended_at, place_label)
);

CREATE INDEX IF NOT EXISTS idx_location_history_stays_member_date
  ON location_history_stays(family_id, member_id, local_date DESC, started_at);

CREATE INDEX IF NOT EXISTS idx_location_history_stays_family_date
  ON location_history_stays(family_id, local_date DESC);
