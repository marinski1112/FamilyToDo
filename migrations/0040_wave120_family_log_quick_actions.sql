CREATE TABLE family_log_quick_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('QUICK','FORM','SLEEP_TOGGLE')),
  log_type TEXT,
  detail_code TEXT,
  amount REAL,
  unit TEXT,
  value_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(subject_id) REFERENCES family_log_subjects(id),
  FOREIGN KEY(created_by) REFERENCES members(id)
);
CREATE INDEX idx_family_log_quick_actions_subject ON family_log_quick_actions(family_id,subject_id,active,sort_order,id);
