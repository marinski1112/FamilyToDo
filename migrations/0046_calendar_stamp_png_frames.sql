CREATE TABLE calendar_stamp_asset_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  frame_index INTEGER NOT NULL CHECK(frame_index BETWEEN 0 AND 47),
  storage_key TEXT NOT NULL CHECK(instr(lower(storage_key),'://')=0 AND lower(storage_key) NOT LIKE 'data:%'),
  duration_ms INTEGER NOT NULL DEFAULT 120 CHECK(duration_ms BETWEEN 40 AND 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(asset_id,frame_index),
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)
);

CREATE INDEX idx_calendar_stamp_asset_frames_family_asset
  ON calendar_stamp_asset_frames(family_id,asset_id,frame_index);

CREATE TRIGGER calendar_stamp_asset_frames_family_insert
BEFORE INSERT ON calendar_stamp_asset_frames
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets
    WHERE id=NEW.asset_id AND family_id=NEW.family_id
      AND asset_kind='ANIMATED' AND mime_type='image/png'
  ) THEN RAISE(ABORT,'calendar stamp frame asset mismatch') END);
END;

CREATE TRIGGER calendar_stamp_asset_frames_family_update
BEFORE UPDATE OF family_id,asset_id ON calendar_stamp_asset_frames
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets
    WHERE id=NEW.asset_id AND family_id=NEW.family_id
      AND asset_kind='ANIMATED' AND mime_type='image/png'
  ) THEN RAISE(ABORT,'calendar stamp frame asset mismatch') END);
END;
