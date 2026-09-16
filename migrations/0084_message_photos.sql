-- Independent of the shared-stamp deletion migration in the other open PR.
ALTER TABLE messages ADD COLUMN image_upload_id TEXT;
CREATE UNIQUE INDEX idx_messages_image_upload ON messages(image_upload_id) WHERE image_upload_id IS NOT NULL;
CREATE TABLE message_photos (
  upload_id TEXT PRIMARY KEY,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 4194304),
  caption TEXT NOT NULL,
  reminder_at TEXT,
  state TEXT NOT NULL DEFAULT 'staging' CHECK(state IN ('staging','ready','delete_pending','deleted')),
  writers INTEGER NOT NULL DEFAULT 0 CHECK(writers>=0),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_message_photos_cleanup ON message_photos(family_id,state,created_at);
CREATE TRIGGER message_photo_delete_queue AFTER DELETE ON messages
WHEN OLD.image_upload_id IS NOT NULL
BEGIN UPDATE message_photos SET state='delete_pending' WHERE upload_id=OLD.image_upload_id AND family_id=OLD.family_id; END;
