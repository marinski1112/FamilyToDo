-- Dedicated outbound Google Calendar projection for Child Growth Journal.
-- The existing external_calendar_accounts.calendar_id remains reserved for
-- task/event schedule sync; Child Journal gets its own calendar binding.

CREATE TABLE IF NOT EXISTS child_journal_calendar_bindings (
  family_id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'GOOGLE_CALENDAR' CHECK (provider='GOOGLE_CALENDAR'),
  purpose TEXT NOT NULL DEFAULT 'CHILD_JOURNAL' CHECK (purpose='CHILD_JOURNAL'),
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL DEFAULT 'Family TODO 成長日記',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ERROR')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES external_calendar_accounts(id) ON DELETE CASCADE,
  UNIQUE(provider,calendar_id)
);

CREATE TABLE IF NOT EXISTS child_journal_calendar_links (
  log_id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_etag TEXT,
  last_synced_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (log_id) REFERENCES family_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS child_journal_calendar_outbox (
  log_id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  operation TEXT NOT NULL DEFAULT 'UPSERT' CHECK (operation IN ('UPSERT','DELETE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','ERROR')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (log_id) REFERENCES family_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_child_journal_calendar_outbox_due
  ON child_journal_calendar_outbox(status,next_retry_at,retry_count);

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_binding_tenant_insert
BEFORE INSERT ON child_journal_calendar_bindings
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM external_calendar_accounts a
  WHERE a.id=NEW.account_id AND a.family_id=NEW.family_id AND a.provider='GOOGLE_CALENDAR'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_account_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_binding_tenant_update
BEFORE UPDATE OF family_id,account_id,provider,purpose ON child_journal_calendar_bindings
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM external_calendar_accounts a
  WHERE a.id=NEW.account_id AND a.family_id=NEW.family_id AND a.provider='GOOGLE_CALENDAR'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_account_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_outbox_tenant_insert
BEFORE INSERT ON child_journal_calendar_outbox
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM family_log_journal_entries j
  JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id
  WHERE j.log_id=NEW.log_id AND j.family_id=NEW.family_id AND j.journal_kind='CHILD'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_log_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_outbox_tenant_update
BEFORE UPDATE OF log_id,family_id ON child_journal_calendar_outbox
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM family_log_journal_entries j
  JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id
  WHERE j.log_id=NEW.log_id AND j.family_id=NEW.family_id AND j.journal_kind='CHILD'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_log_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_link_tenant_insert
BEFORE INSERT ON child_journal_calendar_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM family_log_journal_entries j
  JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id
  WHERE j.log_id=NEW.log_id AND j.family_id=NEW.family_id AND j.journal_kind='CHILD'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_log_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_link_tenant_update
BEFORE UPDATE OF log_id,family_id ON child_journal_calendar_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM family_log_journal_entries j
  JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id
  WHERE j.log_id=NEW.log_id AND j.family_id=NEW.family_id AND j.journal_kind='CHILD'
)
BEGIN
  SELECT RAISE(ABORT, 'child_journal_calendar_log_mismatch');
END;

-- Backfill entries created after the journal foundation but before this sync layer.
INSERT OR IGNORE INTO child_journal_calendar_outbox(
  log_id,family_id,operation,status,retry_count,next_retry_at,last_error,created_at,updated_at
)
SELECT j.log_id,j.family_id,'UPSERT','PENDING',0,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM family_log_journal_entries j
JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id AND l.deleted_at IS NULL
WHERE j.journal_kind='CHILD' AND j.google_sync_enabled=1;
