CREATE TABLE calendar_stamp_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK(asset_kind IN ('ANIMATED','STATIC')),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/gif','image/webp','image/png')),
  storage_provider TEXT NOT NULL DEFAULT 'ASSETS' CHECK(storage_provider IN ('ASSETS','UPLOAD')),
  storage_key TEXT NOT NULL,
  thumbnail_storage_key TEXT,
  width INTEGER CHECK(width IS NULL OR width BETWEEN 1 AND 4096),
  height INTEGER CHECK(height IS NULL OR height BETWEEN 1 AND 4096),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,storage_provider,storage_key),
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(created_by) REFERENCES members(id)
);

CREATE INDEX idx_calendar_stamp_assets_family_active
  ON calendar_stamp_assets(family_id,active,id);

CREATE TABLE calendar_stamp_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  stamp_date TEXT NOT NULL,
  visibility_scope TEXT NOT NULL DEFAULT 'FAMILY' CHECK(visibility_scope IN ('FAMILY','PRIVATE')),
  private_owner_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(
    (visibility_scope='FAMILY' AND private_owner_id IS NULL)
    OR
    (visibility_scope='PRIVATE' AND private_owner_id IS NOT NULL)
  ),
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id),
  FOREIGN KEY(private_owner_id) REFERENCES members(id),
  FOREIGN KEY(created_by) REFERENCES members(id)
);

CREATE INDEX idx_calendar_stamp_placements_family_date
  ON calendar_stamp_placements(family_id,stamp_date,sort_order,id);
CREATE INDEX idx_calendar_stamp_placements_private_owner
  ON calendar_stamp_placements(family_id,private_owner_id,stamp_date);
