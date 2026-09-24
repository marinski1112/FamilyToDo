ALTER TABLE members ADD COLUMN line_picture_url TEXT;

CREATE TABLE IF NOT EXISTS message_reads (
  family_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (family_id, message_id, member_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_reads_member ON message_reads(family_id, member_id, message_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_message_immediate_once
ON notifications(family_id, member_id, type, target_id)
WHERE type='message_immediate';
