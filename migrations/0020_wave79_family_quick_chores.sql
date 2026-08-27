-- Wave79: reusable, family-shared "small chore" buttons for Family Log.
CREATE TABLE IF NOT EXISTS family_quick_chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (created_by) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_family_quick_chores_family
  ON family_quick_chores(family_id, active, sort_order, id);
