-- Flexible, undated meals. Wishes and recipe identities are retained.
ALTER TABLE meal_wishlist ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ADOPTED','REJECTED'));
ALTER TABLE meal_wishlist ADD COLUMN decision_at TEXT;
CREATE TABLE meal_cooking_queue (
 family_id INTEGER NOT NULL,id TEXT NOT NULL,wish_id TEXT NOT NULL,
 name TEXT NOT NULL,recipe_json TEXT,servings INTEGER NOT NULL CHECK(servings BETWEEN 1 AND 30),
 shopping_text TEXT NOT NULL,adoption_hash TEXT NOT NULL,edit_hash TEXT,revision TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','COOKED','DROPPED')),
 shopping_job_id TEXT,created_by INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 completed_at TEXT,completed_by INTEGER,completion_token TEXT,inventory_result_json TEXT,
 PRIMARY KEY(family_id,id),CHECK(recipe_json IS NULL OR json_valid(recipe_json))
);
CREATE UNIQUE INDEX meal_queue_active_wish ON meal_cooking_queue(family_id,wish_id) WHERE status='ACTIVE';
CREATE INDEX meal_queue_family_status ON meal_cooking_queue(family_id,status,updated_at DESC);
CREATE TABLE meal_queue_shopping_jobs (
 family_id INTEGER NOT NULL,id TEXT NOT NULL,payload_hash TEXT NOT NULL,products_json TEXT NOT NULL CHECK(json_valid(products_json)),
 entries_json TEXT NOT NULL CHECK(json_valid(entries_json)),status TEXT NOT NULL CHECK(status IN ('PENDING','DONE')),
 operation_token TEXT NOT NULL,created_by INTEGER NOT NULL,created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
