-- Explicitly managed additional places; existing HOME contract remains unchanged.
CREATE TABLE IF NOT EXISTS family_location_named_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 40),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy_meters REAL NOT NULL CHECK(accuracy_meters BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,label)
);
CREATE TABLE IF NOT EXISTS location_arrival_preferences (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  PRIMARY KEY(family_id,member_id)
);
CREATE TABLE IF NOT EXISTS location_arrival_states (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  place_key TEXT NOT NULL,
  place_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('IN','OUT')),
  last_arrival_at TEXT,
  pending_since TEXT,
  PRIMARY KEY(family_id,member_id,place_key)
);
CREATE TABLE IF NOT EXISTS location_arrival_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  place_key TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ATTEMPTED','SENT','FAILED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(family_id,member_id,recipient_id,place_key,recorded_at)
);
CREATE INDEX IF NOT EXISTS idx_location_arrival_delivery_recent ON location_arrival_deliveries(family_id,recipient_id,id);
