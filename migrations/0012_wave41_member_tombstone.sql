-- Wave41: retain deleted members as tombstones so historical completion/assignment/activity references survive.
ALTER TABLE members ADD COLUMN deleted_at TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_members_family_deleted ON members(family_id,active,deleted_at);
