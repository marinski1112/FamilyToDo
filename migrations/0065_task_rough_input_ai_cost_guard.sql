CREATE TABLE IF NOT EXISTS task_rough_input_ai_family_daily (
  family_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(family_id, local_date),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_rough_input_ai_family_daily_date
  ON task_rough_input_ai_family_daily(local_date);

CREATE TABLE IF NOT EXISTS task_rough_input_ai_global_daily (
  budget_date TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  blocked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
