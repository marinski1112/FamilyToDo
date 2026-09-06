-- Cache one privacy-safe weather summary per family/local date.
-- Raw HOME coordinates are never persisted here.
CREATE TABLE IF NOT EXISTS line_daily_digest_weather_daily (
  family_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 160),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(family_id, local_date),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_daily_digest_weather_daily_date
  ON line_daily_digest_weather_daily(local_date);
