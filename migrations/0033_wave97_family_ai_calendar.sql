-- Wave97: provider-neutral Google Calendar projection. D1 tasks remain authoritative.
CREATE TABLE external_calendar_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE_CALENDAR')),
  refresh_token_ciphertext TEXT NOT NULL,
  token_key_version TEXT NOT NULL,
  calendar_id TEXT,
  calendar_name TEXT NOT NULL DEFAULT 'Family TODO',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,provider)
);

CREATE TABLE external_calendar_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE_CALENDAR')),
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_etag TEXT,
  last_synced_at TEXT,
  deleted_at TEXT,
  UNIQUE(provider,task_id)
);

CREATE TABLE calendar_sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  task_id INTEGER,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE_CALENDAR')),
  operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE','ERROR')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider,task_id)
);
CREATE INDEX idx_calendar_outbox_due ON calendar_sync_outbox(status,next_retry_at,retry_count);

CREATE TABLE calendar_sync_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  sync_token TEXT,
  last_synced_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,provider,calendar_id)
);
