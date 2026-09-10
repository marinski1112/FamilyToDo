-- Duplicate-safe identity ledger for future explicit Google Calendar -> FamilyToDo imports.
-- This table is intentionally separate from external_calendar_links, which belongs to the
-- FamilyToDo -> app-owned Google Calendar projection lane.
CREATE TABLE IF NOT EXISTS google_calendar_inbound_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES external_calendar_accounts(id) ON DELETE SET NULL,
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  ical_uid TEXT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  external_etag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id, calendar_id, external_event_id)
);

-- A local task may represent at most one Google inbound event for a family. The external
-- identity row survives task deletion (task_id becomes NULL), so the same Google event is
-- not silently treated as new again later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_calendar_inbound_task
  ON google_calendar_inbound_links(family_id, task_id)
  WHERE task_id IS NOT NULL;

-- iCalUID is a secondary cross-check only. It is deliberately not unique because recurring
-- Google occurrences may share an iCalUID while having distinct event IDs.
CREATE INDEX IF NOT EXISTS idx_google_calendar_inbound_ical_uid
  ON google_calendar_inbound_links(family_id, ical_uid)
  WHERE ical_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_calendar_inbound_account
  ON google_calendar_inbound_links(family_id, account_id, calendar_id);
