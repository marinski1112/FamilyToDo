-- Global shared-stamp deletion now physically purges participant-local stamp rows
-- after remote deletion is confirmed and all local R2 cleanup has completed.
--
-- 0083 deliberately retained stamp masters forever. Keep its admission/ref/
-- placement/message guards while a purge is active, but allow the final local
-- cleanup batch to remove the stamp master itself.
DROP TRIGGER IF EXISTS calendar_stamp_global_keep_asset_history;

-- Photo-transfer capabilities are source-bound. Deleting a message must erase
-- capabilities that can no longer be redeemed, including message deletion
-- initiated by shared-stamp cascade cleanup rather than the normal message API.
CREATE TRIGGER IF NOT EXISTS message_photo_transfer_delete
AFTER DELETE ON messages
BEGIN
  DELETE FROM photo_transfers
  WHERE source_kind='message' AND source_id=OLD.id AND family_id=OLD.family_id;
END;

-- Close the read -> capability-insert race: once the source message has been
-- deleted, a late mint may not recreate a trace referring to that message.
CREATE TRIGGER IF NOT EXISTS photo_transfer_message_insert_guard
BEFORE INSERT ON photo_transfers
WHEN NEW.source_kind='message'
 AND NOT EXISTS(
   SELECT 1 FROM messages m
   WHERE m.id=NEW.source_id AND m.family_id=NEW.family_id
 )
BEGIN
  SELECT RAISE(ABORT,'message source missing');
END;

CREATE TRIGGER IF NOT EXISTS photo_transfer_message_update_guard
BEFORE UPDATE OF source_kind,source_id,family_id ON photo_transfers
WHEN NEW.source_kind='message'
 AND NOT EXISTS(
   SELECT 1 FROM messages m
   WHERE m.id=NEW.source_id AND m.family_id=NEW.family_id
 )
BEGIN
  SELECT RAISE(ABORT,'message source missing');
END;
