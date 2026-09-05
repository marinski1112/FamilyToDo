-- App-local projection identity for the shared Mitenya / FamilyToDo stamp catalog.
--
-- Calendar/message placements continue to reference calendar_stamp_assets.id so
-- existing family/private authorization stays entirely inside FamilyToDo. This
-- table only records which immutable shared catalog version a local asset mirrors.
-- Shared service URLs, credentials and R2 object keys are intentionally not stored.

CREATE TABLE calendar_shared_stamp_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL UNIQUE,
  shared_stamp_id TEXT NOT NULL CHECK(
    length(shared_stamp_id) BETWEEN 1 AND 64
    AND shared_stamp_id NOT GLOB '*[^a-z0-9-]*'
    AND substr(shared_stamp_id,1,1) GLOB '[a-z0-9]'
    AND substr(shared_stamp_id,-1,1) GLOB '[a-z0-9]'
  ),
  shared_version INTEGER NOT NULL CHECK(shared_version > 0),
  representation TEXT NOT NULL CHECK(representation IN ('SINGLE_FILE','FRAME_SEQUENCE')),
  created_at TEXT NOT NULL,
  synchronized_at TEXT NOT NULL,
  UNIQUE(family_id,shared_stamp_id,shared_version),
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)
);

CREATE INDEX idx_calendar_shared_stamp_refs_family_shared
  ON calendar_shared_stamp_refs(family_id,shared_stamp_id,shared_version);

CREATE TRIGGER calendar_shared_stamp_refs_family_insert
BEFORE INSERT ON calendar_shared_stamp_refs
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets
    WHERE id=NEW.asset_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'calendar shared stamp asset family mismatch') END);
END;

CREATE TRIGGER calendar_shared_stamp_refs_family_update
BEFORE UPDATE OF family_id,asset_id ON calendar_shared_stamp_refs
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_stamp_assets
    WHERE id=NEW.asset_id AND family_id=NEW.family_id
  ) THEN RAISE(ABORT,'calendar shared stamp asset family mismatch') END);
END;
