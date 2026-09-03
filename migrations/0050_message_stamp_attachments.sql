CREATE TABLE message_stamp_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL UNIQUE,
  asset_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id),
  FOREIGN KEY(created_by) REFERENCES members(id)
);

CREATE INDEX idx_message_stamp_attachments_family_message
  ON message_stamp_attachments(family_id,message_id);

CREATE TRIGGER message_stamp_attachments_family_insert
BEFORE INSERT ON message_stamp_attachments
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM messages WHERE id=NEW.message_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp message family mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets WHERE id=NEW.asset_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp asset family mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM members WHERE id=NEW.created_by AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp creator family mismatch') END);
END;

CREATE TRIGGER message_stamp_attachments_family_update
BEFORE UPDATE OF family_id,message_id,asset_id,created_by ON message_stamp_attachments
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM messages WHERE id=NEW.message_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp message family mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets WHERE id=NEW.asset_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp asset family mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM members WHERE id=NEW.created_by AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'message stamp creator family mismatch') END);
END;
