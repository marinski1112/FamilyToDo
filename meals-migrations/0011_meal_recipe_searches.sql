-- User-triggered search receipts in MEALS_DB; names/URLs only, no raw pages.
CREATE TABLE meal_recipe_searches (
 family_id INTEGER NOT NULL, id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','READY')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX meal_recipe_searches_family_created ON meal_recipe_searches(family_id,created_at);
