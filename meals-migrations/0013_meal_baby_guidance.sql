-- Receipts contain checklist codes only, never child names, birthdays or ingredient labels.
CREATE TABLE IF NOT EXISTS meal_baby_guidance (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','READY')),
 result_json TEXT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX IF NOT EXISTS meal_baby_guidance_daily ON meal_baby_guidance(family_id,created_at);
