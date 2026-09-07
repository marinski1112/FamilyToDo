CREATE TABLE IF NOT EXISTS task_rough_input_ai_circuit (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  blocked_until TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
