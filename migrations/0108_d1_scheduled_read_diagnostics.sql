-- Fixed-label, hourly D1 read counters for scheduled jobs. No SQL text or user data.
CREATE TABLE IF NOT EXISTS d1_scheduled_read_diagnostics (
  bucket_utc TEXT NOT NULL,
  job TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  measured_queries INTEGER NOT NULL DEFAULT 0,
  unmeasured_first INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket_utc, job)
);
