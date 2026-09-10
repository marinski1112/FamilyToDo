-- Google Calendar inbound apply stays a one-way read/import lane.
-- Once a task has Google inbound identity, normal FamilyToDo -> Google Calendar projection must
-- never CREATE/UPDATE/DELETE a remote event for that imported snapshot.

CREATE TRIGGER IF NOT EXISTS trg_google_calendar_inbound_clear_outbox_insert
AFTER INSERT ON google_calendar_inbound_links
WHEN NEW.task_id IS NOT NULL
BEGIN
  DELETE FROM calendar_sync_outbox
   WHERE family_id=NEW.family_id
     AND provider='GOOGLE_CALENDAR'
     AND task_id=NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_google_calendar_inbound_clear_outbox_update
AFTER UPDATE OF task_id ON google_calendar_inbound_links
WHEN NEW.task_id IS NOT NULL
BEGIN
  DELETE FROM calendar_sync_outbox
   WHERE family_id=NEW.family_id
     AND provider='GOOGLE_CALENDAR'
     AND task_id=NEW.task_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_google_calendar_inbound_block_outbox_insert
BEFORE INSERT ON calendar_sync_outbox
WHEN NEW.provider='GOOGLE_CALENDAR'
 AND NEW.task_id IS NOT NULL
 AND EXISTS (
   SELECT 1
     FROM google_calendar_inbound_links gi
    WHERE gi.family_id=NEW.family_id
      AND gi.task_id=NEW.task_id
 )
BEGIN
  SELECT RAISE(IGNORE);
END;
