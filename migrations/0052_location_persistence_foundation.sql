-- Provider-neutral FamilyToDo Location persistence foundation.
-- OwnTracks is one sensor/provider; domain storage intentionally contains no raw provider payload.
-- Device credentials store only a one-way secret hash. Plaintext device secrets must never be persisted.

CREATE TABLE IF NOT EXISTS location_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE CHECK (length(trim(public_id)) BETWEEN 16 AND 128),
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 64),
  secret_hash TEXT NOT NULL CHECK (length(trim(secret_hash)) BETWEEN 32 AND 255),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sharing_enabled IN (0, 1)),
  revoked_at TEXT,
  last_seen_at TEXT,
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_location_devices_family_member
  ON location_devices(family_id, member_id, enabled, sharing_enabled);

CREATE INDEX IF NOT EXISTS idx_location_devices_member
  ON location_devices(member_id);

CREATE TABLE IF NOT EXISTS member_location_latest (
  member_id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 64),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  accuracy_meters REAL CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  altitude_meters REAL,
  speed_meters_per_second REAL CHECK (speed_meters_per_second IS NULL OR speed_meters_per_second >= 0),
  heading_degrees REAL CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)),
  battery_percent REAL CHECK (battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)),
  trigger TEXT,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES location_devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_location_latest_family
  ON member_location_latest(family_id, recorded_at);

CREATE TABLE IF NOT EXISTS member_location_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 64),
  dedupe_key TEXT NOT NULL CHECK (length(trim(dedupe_key)) BETWEEN 16 AND 255),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  accuracy_meters REAL CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  altitude_meters REAL,
  speed_meters_per_second REAL CHECK (speed_meters_per_second IS NULL OR speed_meters_per_second >= 0),
  heading_degrees REAL CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)),
  battery_percent REAL CHECK (battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)),
  trigger TEXT,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES location_devices(id) ON DELETE CASCADE,
  UNIQUE (device_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_member_location_history_family_time
  ON member_location_history(family_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_member_location_history_member_time
  ON member_location_history(member_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_member_location_history_device_time
  ON member_location_history(device_id, recorded_at);
