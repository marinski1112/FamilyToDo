-- Additive local state; global deletion is not enabled by this migration alone.
CREATE TABLE calendar_stamp_global_deletions (
  shared_stamp_id TEXT PRIMARY KEY,
  captured INTEGER NOT NULL DEFAULT 0 CHECK(captured IN (0,1)),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1))
);
CREATE TABLE calendar_stamp_global_deleted_assets (
  asset_id INTEGER PRIMARY KEY,
  shared_stamp_id TEXT NOT NULL,
  family_id INTEGER NOT NULL
);
CREATE INDEX idx_calendar_stamp_global_deleted_shared
  ON calendar_stamp_global_deleted_assets(shared_stamp_id,asset_id);
CREATE TABLE calendar_stamp_global_cleanup_keys (
  shared_stamp_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  PRIMARY KEY(shared_stamp_id,object_key)
);
CREATE TABLE calendar_stamp_global_operations (
  operation_id TEXT PRIMARY KEY,
  shared_stamp_id TEXT NOT NULL
);
CREATE INDEX idx_calendar_stamp_global_operations_shared
  ON calendar_stamp_global_operations(shared_stamp_id);
CREATE TABLE calendar_stamp_global_materializations (
  shared_stamp_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  PRIMARY KEY(shared_stamp_id,object_key)
);
CREATE TABLE calendar_stamp_global_sources (
  shared_stamp_id TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL,
  PRIMARY KEY(shared_stamp_id,asset_id)
);

CREATE TRIGGER calendar_stamp_global_no_operation
BEFORE INSERT ON calendar_stamp_global_operations
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deletions WHERE shared_stamp_id=NEW.shared_stamp_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_ref_insert
BEFORE INSERT ON calendar_shared_stamp_refs
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deletions WHERE shared_stamp_id=NEW.shared_stamp_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_ref_update
BEFORE UPDATE ON calendar_shared_stamp_refs
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deletions WHERE shared_stamp_id IN (OLD.shared_stamp_id,NEW.shared_stamp_id))
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_asset_update
BEFORE UPDATE ON calendar_stamp_assets
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_keep_asset_history
BEFORE DELETE ON calendar_stamp_assets
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'deleted stamp history retained'); END;
CREATE TRIGGER calendar_stamp_global_no_frame_insert
BEFORE INSERT ON calendar_stamp_asset_frames
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_frame_update
BEFORE UPDATE ON calendar_stamp_asset_frames
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id IN (NEW.asset_id,OLD.asset_id))
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_placement_insert
BEFORE INSERT ON calendar_stamp_placements
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_placement_update
BEFORE UPDATE OF asset_id ON calendar_stamp_placements
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_message_insert
BEFORE INSERT ON message_stamp_attachments
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TRIGGER calendar_stamp_global_no_message_update
BEFORE UPDATE OF asset_id ON message_stamp_attachments
WHEN EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'stamp permanently deleted'); END;
CREATE TABLE calendar_stamp_delete_approvals (
  shared_id TEXT PRIMARY KEY,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  approval TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
