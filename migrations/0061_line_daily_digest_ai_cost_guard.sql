CREATE TABLE IF NOT EXISTS line_daily_digest_ai_family_daily (
  family_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count BETWEEN 0 AND 2),
  finalized INTEGER NOT NULL DEFAULT 0 CHECK(finalized IN (0,1)),
  frame_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(family_id, local_date),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_daily_digest_ai_family_daily_date
  ON line_daily_digest_ai_family_daily(local_date);

CREATE TABLE IF NOT EXISTS line_daily_digest_ai_global_daily (
  local_date TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  blocked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
