-- No master data or LINE identifiers are copied into the meals database.
CREATE TABLE meal_inbox (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('WISH','RECIPE_URL')),
 content TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','DISMISSED')),
 created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX meal_inbox_pending ON meal_inbox(family_id,status,created_at);
