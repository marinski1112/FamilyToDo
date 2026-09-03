-- Family-scoped reusable Shopping category catalog.
-- Existing shopping_items.category strings remain denormalized intentionally so
-- disabling/removing a catalog option never rewrites historical Shopping rows.
CREATE TABLE IF NOT EXISTS shopping_category_catalog (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_category_catalog_family_name
  ON shopping_category_catalog(family_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_shopping_category_catalog_family_enabled
  ON shopping_category_catalog(family_id, enabled, name COLLATE NOCASE);
