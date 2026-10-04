-- Stable request receipts prevent duplicate provider calls after client retries.
CREATE TABLE meal_weekly_suggestions (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','READY')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX meal_weekly_suggestions_daily ON meal_weekly_suggestions(family_id,created_at);
