-- Family-scoped reusable shopping sets, parallel to belongings sets.
CREATE TABLE IF NOT EXISTS shopping_reusable_sets (
 id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, name TEXT NOT NULL, created_by_member_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE, FOREIGN KEY(created_by_member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_reusable_sets_family_name ON shopping_reusable_sets(family_id,name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS shopping_reusable_set_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, set_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT '1',
 category TEXT, memo TEXT, url TEXT, FOREIGN KEY(set_id) REFERENCES shopping_reusable_sets(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_reusable_set_entries_position ON shopping_reusable_set_entries(set_id,position);
CREATE TABLE IF NOT EXISTS shopping_reusable_set_invocations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, set_id_snapshot INTEGER NOT NULL, due_date TEXT NOT NULL,
 client_request_id TEXT NOT NULL, created_by_member_id INTEGER NOT NULL, created_item_ids TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE, FOREIGN KEY(created_by_member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_reusable_set_invocations_family_request ON shopping_reusable_set_invocations(family_id,client_request_id);
