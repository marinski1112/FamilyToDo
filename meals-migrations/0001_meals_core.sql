-- Apply ONLY to MEALS_DB. Existing DB owns identities and shopping.
CREATE TABLE recipes (
 family_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 servings INTEGER NOT NULL CHECK(servings BETWEEN 1 AND 30),
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 source_url TEXT, ingredients_json TEXT NOT NULL CHECK(json_valid(ingredients_json)),
 steps_json TEXT NOT NULL CHECK(json_valid(steps_json)),
 revision TEXT NOT NULL, payload_hash TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX recipes_family_active ON recipes(family_id,archived,updated_at DESC);
CREATE TABLE meal_wishlist (
 family_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX meal_wishlist_family_created ON meal_wishlist(family_id,created_at DESC);
CREATE TABLE weekly_plans (
 family_id INTEGER NOT NULL, week_start TEXT NOT NULL, revision TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('DRAFT','CONFIRMED')),
 items_json TEXT NOT NULL CHECK(json_valid(items_json)), payload_hash TEXT NOT NULL,
 updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,week_start)
);
CREATE TABLE cooked_events (
 family_id INTEGER NOT NULL, meal_date TEXT NOT NULL, plan_revision TEXT NOT NULL,
 cooked_by INTEGER NOT NULL, cooked_at TEXT NOT NULL,
 PRIMARY KEY(family_id,meal_date,plan_revision)
);
