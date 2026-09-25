-- Static PNG backgrounds for individual Calendar days. Uploaded media remains
-- in the existing per-family R2 namespace; deletion of a placement retains it.
CREATE TABLE IF NOT EXISTS calendar_sticker_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  UNIQUE(family_id,storage_key)
);
CREATE INDEX IF NOT EXISTS idx_calendar_sticker_assets_family ON calendar_sticker_assets(family_id,active,id);
CREATE TABLE IF NOT EXISTS calendar_sticker_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  asset_id INTEGER NOT NULL REFERENCES calendar_sticker_assets(id),
  sticker_date TEXT NOT NULL,
  owner_id INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,sticker_date,owner_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_sticker_days_range ON calendar_sticker_days(family_id,sticker_date,owner_id);
CREATE TRIGGER IF NOT EXISTS calendar_sticker_assets_tenant BEFORE INSERT ON calendar_sticker_assets BEGIN
  SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.created_by AND family_id=NEW.family_id AND active=1)
    THEN RAISE(ABORT,'sticker creator family mismatch') END);
END;
CREATE TRIGGER IF NOT EXISTS calendar_sticker_days_tenant BEFORE INSERT ON calendar_sticker_days BEGIN
  SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM calendar_sticker_assets WHERE id=NEW.asset_id AND family_id=NEW.family_id AND active=1)
    OR NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.created_by AND family_id=NEW.family_id AND active=1)
    OR (NEW.owner_id<>0 AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.owner_id AND family_id=NEW.family_id AND active=1))
    THEN RAISE(ABORT,'sticker placement family mismatch') END);
END;
CREATE TRIGGER IF NOT EXISTS calendar_sticker_days_tenant_update BEFORE UPDATE OF asset_id,family_id,owner_id ON calendar_sticker_days BEGIN
  SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM calendar_sticker_assets WHERE id=NEW.asset_id AND family_id=NEW.family_id AND active=1)
    OR (NEW.owner_id<>0 AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.owner_id AND family_id=NEW.family_id AND active=1))
    THEN RAISE(ABORT,'sticker placement family mismatch') END);
END;
