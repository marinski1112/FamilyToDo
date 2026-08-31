-- Prevent duplicate Shopping side effects when a Google voice command that already
-- exists as NEEDS_REVIEW/ERROR is corrected into a valid SHOPPING_ADD command.
--
-- src/google-tasks.ts intentionally creates the domain Shopping row before recording
-- the external command.  Older command rows therefore need an idempotent upsert path:
-- turn the attempted INSERT into an UPDATE of the existing command row, then ignore
-- the duplicate INSERT before the table UNIQUE constraint is evaluated.
CREATE TRIGGER IF NOT EXISTS trg_google_voice_shopping_add_existing_command
BEFORE INSERT ON external_google_voice_commands
WHEN NEW.command_type = 'SHOPPING_ADD'
 AND EXISTS (
   SELECT 1
   FROM external_google_voice_commands existing
   WHERE existing.account_id = NEW.account_id
     AND existing.external_tasklist_id = NEW.external_tasklist_id
     AND existing.external_task_id = NEW.external_task_id
     AND existing.status <> 'EXECUTED'
 )
BEGIN
  UPDATE external_google_voice_commands
     SET external_etag = NEW.external_etag,
         external_due = NEW.external_due,
         command_type = 'SHOPPING_ADD',
         target_type = 'shopping',
         target_id = NEW.target_id,
         status = 'EXECUTED',
         error_code = NULL,
         updated_at = NEW.updated_at
   WHERE account_id = NEW.account_id
     AND external_tasklist_id = NEW.external_tasklist_id
     AND external_task_id = NEW.external_task_id
     AND status <> 'EXECUTED';
  SELECT RAISE(IGNORE);
END;
