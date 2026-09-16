-- Global shared-stamp deletion now physically purges participant-local stamp rows
-- after remote deletion is confirmed and all local R2 cleanup has completed.
--
-- 0083 deliberately retained stamp masters forever. Keep its admission/ref/
-- placement/message guards while a purge is active, but allow the final local
-- cleanup batch to remove the stamp master itself.
DROP TRIGGER IF EXISTS calendar_stamp_global_keep_asset_history;

-- A cascaded message-photo purge must not retain the photo row (which contains
-- member, digest, MIME, size and object metadata), but removing it entirely would
-- let a delayed retry recreate the deleted post under the same upload identity.
-- Keep only the opaque client-generated upload ID as a replay guard. It has no
-- shared-stamp ID, object key or user content attached to it.
CREATE TABLE IF NOT EXISTS message_photo_replay_guards (
  upload_id TEXT PRIMARY KEY
);

CREATE TRIGGER IF NOT EXISTS message_photo_replay_guard_insert
BEFORE INSERT ON message_photos
WHEN EXISTS(
  SELECT 1 FROM message_photo_replay_guards g WHERE g.upload_id=NEW.upload_id
)
BEGIN
  SELECT RAISE(ABORT,'photo upload deleted');
END;

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
