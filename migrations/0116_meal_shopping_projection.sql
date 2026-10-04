-- Coordination metadata, not another shopping list. Items remain in shopping_items.
CREATE TABLE meal_shopping_projections (
 family_id INTEGER NOT NULL, week_start TEXT NOT NULL, payload_hash TEXT NOT NULL,
 operation_id TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,week_start),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);
