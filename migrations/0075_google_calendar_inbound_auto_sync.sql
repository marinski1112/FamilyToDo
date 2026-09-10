-- Incremental state for automatic Google Calendar -> FamilyToDo imports.
-- This remains separate from the outbound projection state/credentials.
CREATE TABLE IF NOT EXISTS google_calendar_inbound_sync_state (
  family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'BOOTSTRAP' CHECK(phase IN ('BOOTSTRAP','ACTIVE')),
  sync_token TEXT,
  page_token TEXT,
  bootstrap_since TEXT NOT NULL,
  last_synced_at TEXT,
  last_error TEXT,
  lease_token TEXT,
  lease_expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_inbound_sync_due
  ON google_calendar_inbound_sync_state(phase, lease_expires_at, updated_at);
