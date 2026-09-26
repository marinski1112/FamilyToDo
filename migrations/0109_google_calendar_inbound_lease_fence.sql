-- One row per family; the trigger makes the first statement in a D1 batch fail
-- atomically when a worker no longer owns the live inbound lease.
CREATE TABLE IF NOT EXISTS google_calendar_inbound_lease_fence (
  family_id INTEGER PRIMARY KEY,
  lease_token TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS google_calendar_inbound_fence_insert
BEFORE INSERT ON google_calendar_inbound_lease_fence
WHEN NOT EXISTS (
  SELECT 1 FROM google_calendar_inbound_sync_state
  WHERE family_id=NEW.family_id AND lease_token=NEW.lease_token
    AND lease_expires_at>CAST(strftime('%s','now') AS INTEGER)
)
BEGIN SELECT RAISE(ABORT,'INBOUND_LEASE_LOST'); END;
CREATE TRIGGER IF NOT EXISTS google_calendar_inbound_fence_update
BEFORE UPDATE ON google_calendar_inbound_lease_fence
WHEN NOT EXISTS (
  SELECT 1 FROM google_calendar_inbound_sync_state
  WHERE family_id=NEW.family_id AND lease_token=NEW.lease_token
    AND lease_expires_at>CAST(strftime('%s','now') AS INTEGER)
)
BEGIN SELECT RAISE(ABORT,'INBOUND_LEASE_LOST'); END;
