-- Message chat polling has two independent seek axes:
-- new message ids within one family, and scheduled messages released by reminder time.
CREATE INDEX IF NOT EXISTS idx_messages_family_id_seek
ON messages (family_id, id);

CREATE INDEX IF NOT EXISTS idx_messages_release_seek
ON messages (family_id, reminder_at, id)
WHERE reminder_at IS NOT NULL;
