-- References the existing family-log subject; never duplicates identity or birth dates.
CREATE TABLE meal_baby_profiles (
 family_id INTEGER NOT NULL, subject_id INTEGER NOT NULL,
 revision TEXT NOT NULL, payload_hash TEXT NOT NULL,
 conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json)),
 updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,subject_id)
);
