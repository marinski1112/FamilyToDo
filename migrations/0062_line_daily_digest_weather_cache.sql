-- Morning digest weather is optional and fail-open. This cache is also the external-call claim:
-- one family/date row means at most one provider attempt for that local date, including failures.
CREATE TABLE IF NOT EXISTS line_daily_digest_weather_cache (
  family_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('FETCHING','READY','FAILED')),
  payload_json TEXT,
  attempted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(family_id, local_date),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_daily_digest_weather_status
ON line_daily_digest_weather_cache(local_date,status,family_id);
