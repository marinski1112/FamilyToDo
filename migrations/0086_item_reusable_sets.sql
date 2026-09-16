-- Family-scoped reusable belongings sets.
-- Set definitions are snapshots only: actual item completion state is never stored here.
CREATE TABLE IF NOT EXISTS item_reusable_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_by_member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_reusable_sets_family_name
  ON item_reusable_sets(family_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS item_reusable_set_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  memo TEXT,
  url TEXT,
  category TEXT,
  FOREIGN KEY (set_id) REFERENCES item_reusable_sets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_reusable_set_entries_position
  ON item_reusable_set_entries(set_id, position);

CREATE INDEX IF NOT EXISTS idx_item_reusable_set_entries_set
  ON item_reusable_set_entries(set_id, id);

-- Invocation ledger is deliberately separate from the definition snapshot.
-- set_id_snapshot is not a foreign key so idempotency evidence survives set deletion.
CREATE TABLE IF NOT EXISTS item_reusable_set_invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  set_id_snapshot INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  client_request_id TEXT NOT NULL CHECK (length(trim(client_request_id)) BETWEEN 1 AND 72),
  created_by_member_id INTEGER NOT NULL,
  created_item_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_reusable_set_invocations_family_request
  ON item_reusable_set_invocations(family_id, client_request_id);

CREATE INDEX IF NOT EXISTS idx_item_reusable_set_invocations_family_created
  ON item_reusable_set_invocations(family_id, created_at DESC);
