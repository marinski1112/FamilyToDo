-- Sampled, fixed-label HTTP read counters. No URL, SQL, parameters, or user data.
CREATE TABLE IF NOT EXISTS d1_http_read_diagnostics (
  bucket_utc TEXT NOT NULL,
  route_group TEXT NOT NULL,
  samples INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  measured_queries INTEGER NOT NULL DEFAULT 0,
  unmeasured_first INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(bucket_utc,route_group)
);
