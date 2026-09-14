-- Child-specific registered ingredients. Stage flags describe recorded experience,
-- not medical recommendations or an inferred feeding schedule.
CREATE TABLE IF NOT EXISTS child_food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  subject_id INTEGER NOT NULL REFERENCES family_log_subjects(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  name_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER' CHECK(category IN ('GRAIN','VEGETABLE','FRUIT','MEAT','FISH','OTHER')),
  first_tried_on TEXT,
  stage_mask INTEGER NOT NULL DEFAULT 0 CHECK(stage_mask BETWEEN 0 AND 15),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,subject_id,name_key)
);
CREATE INDEX IF NOT EXISTS idx_child_food_subject ON child_food_entries(family_id,subject_id,category,name_key);
