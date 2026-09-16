-- Family-scoped belongings categories and checklist entry persistence.
-- Existing items keep their historical meaning: NULL/empty category is rendered as 未分類.
-- Catalog disable/rename logic must never delete item rows.
ALTER TABLE items ADD COLUMN category TEXT;
ALTER TABLE items ADD COLUMN url TEXT;
ALTER TABLE items ADD COLUMN client_request_id TEXT;

CREATE TABLE IF NOT EXISTS item_category_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_custom INTEGER NOT NULL DEFAULT 1 CHECK (is_custom IN (0, 1)),
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_category_catalog_family_name
  ON item_category_catalog(family_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_item_category_catalog_family_enabled
  ON item_category_catalog(family_id, enabled, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_items_family_category
  ON items(family_id, category COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_family_client_request_id
  ON items(family_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND length(trim(client_request_id)) > 0;
