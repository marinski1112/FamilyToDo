-- Dedicated one-way Google Calendar projection for Child Growth Journal.
-- OAuth credentials are reused from external_calendar_accounts, but journal
-- calendar identity, links, and outbox are intentionally isolated from the
-- normal task/event calendar projection and from inbound sync.

CREATE TABLE IF NOT EXISTS child_journal_calendar_accounts (
  family_id INTEGER PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL DEFAULT 'Family TODO - 成長日記',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ERROR')),
  last_error TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS child_journal_calendar_links (
  log_id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_etag TEXT,
  last_synced_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_child_journal_calendar_external_event
  ON child_journal_calendar_links(family_id,calendar_id,external_event_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS child_journal_calendar_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  log_id INTEGER NOT NULL UNIQUE,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','ERROR')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_child_journal_calendar_outbox_due
  ON child_journal_calendar_outbox(status,next_retry_at,id);

-- If a canonical Family Log entry changes subjects, keep journal metadata in
-- lock-step. The tenant/kind trigger created in 0048 rejects invalid moves.
CREATE TRIGGER IF NOT EXISTS trg_child_journal_follow_log_subject
AFTER UPDATE OF subject_id ON family_logs
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM family_log_journal_entries j WHERE j.log_id=NEW.id)
BEGIN
  UPDATE family_log_journal_entries
     SET subject_id=NEW.subject_id,
         updated_at=CURRENT_TIMESTAMP
   WHERE log_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_enqueue_insert
AFTER INSERT ON family_log_journal_entries
FOR EACH ROW
WHEN NEW.journal_kind='CHILD' AND NEW.google_sync_enabled=1
BEGIN
  INSERT INTO child_journal_calendar_outbox(family_id,log_id,operation,status,retry_count,next_retry_at,last_error,created_at,updated_at)
  VALUES(NEW.family_id,NEW.log_id,'CREATE','PENDING',0,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(log_id) DO UPDATE SET
    family_id=excluded.family_id,
    operation='CREATE',
    status='PENDING',
    retry_count=0,
    next_retry_at=excluded.next_retry_at,
    last_error=NULL,
    updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_enqueue_metadata_update
AFTER UPDATE OF subject_id,entry_kind,milestone_code,google_sync_enabled ON family_log_journal_entries
FOR EACH ROW
WHEN NEW.journal_kind='CHILD'
BEGIN
  INSERT INTO child_journal_calendar_outbox(family_id,log_id,operation,status,retry_count,next_retry_at,last_error,created_at,updated_at)
  VALUES(NEW.family_id,NEW.log_id,CASE WHEN NEW.google_sync_enabled=1 THEN 'UPDATE' ELSE 'DELETE' END,'PENDING',0,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(log_id) DO UPDATE SET
    family_id=excluded.family_id,
    operation=CASE
      WHEN excluded.operation='DELETE' THEN 'DELETE'
      WHEN child_journal_calendar_outbox.operation='CREATE' AND child_journal_calendar_outbox.status<>'DONE' THEN 'CREATE'
      ELSE excluded.operation
    END,
    status='PENDING',
    retry_count=0,
    next_retry_at=excluded.next_retry_at,
    last_error=NULL,
    updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_enqueue_log_update
AFTER UPDATE OF subject_id,occurred_at,log_type,detail_code,amount,unit,value_text,note,deleted_at ON family_logs
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM family_log_journal_entries j
  WHERE j.log_id=NEW.id AND j.journal_kind='CHILD' AND j.google_sync_enabled=1
)
BEGIN
  INSERT INTO child_journal_calendar_outbox(family_id,log_id,operation,status,retry_count,next_retry_at,last_error,created_at,updated_at)
  VALUES(NEW.family_id,NEW.id,CASE WHEN NEW.deleted_at IS NULL THEN 'UPDATE' ELSE 'DELETE' END,'PENDING',0,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(log_id) DO UPDATE SET
    family_id=excluded.family_id,
    operation=CASE
      WHEN excluded.operation='DELETE' THEN 'DELETE'
      WHEN child_journal_calendar_outbox.operation='CREATE' AND child_journal_calendar_outbox.status<>'DONE' THEN 'CREATE'
      ELSE excluded.operation
    END,
    status='PENDING',
    retry_count=0,
    next_retry_at=excluded.next_retry_at,
    last_error=NULL,
    updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_child_journal_calendar_enqueue_metadata_delete
AFTER DELETE ON family_log_journal_entries
FOR EACH ROW
WHEN OLD.journal_kind='CHILD' AND OLD.google_sync_enabled=1
BEGIN
  INSERT INTO child_journal_calendar_outbox(family_id,log_id,operation,status,retry_count,next_retry_at,last_error,created_at,updated_at)
  VALUES(OLD.family_id,OLD.log_id,'DELETE','PENDING',0,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(log_id) DO UPDATE SET
    family_id=excluded.family_id,
    operation='DELETE',
    status='PENDING',
    retry_count=0,
    next_retry_at=excluded.next_retry_at,
    last_error=NULL,
    updated_at=excluded.updated_at;
END;
