-- Keep archive discovery bounded while retaining raw location history.
CREATE TABLE IF NOT EXISTS location_history_archive_scan_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  last_id INTEGER NOT NULL DEFAULT 0 CHECK (last_id>=0)
);
INSERT OR IGNORE INTO location_history_archive_scan_state(id,last_id) VALUES(1,0);

-- The previous JST day's discovery uses an indexed UTC interval.
CREATE INDEX IF NOT EXISTS idx_member_location_history_recorded_archive
  ON member_location_history(recorded_at, family_id, member_id);
