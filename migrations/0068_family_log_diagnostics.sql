-- Opt-in operational evidence only: never Family Log contents or credentials.
CREATE TABLE IF NOT EXISTS family_log_diagnostics (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  events_json TEXT NOT NULL,
  PRIMARY KEY (family_id, correlation_id)
);
CREATE INDEX IF NOT EXISTS idx_family_log_diagnostics_age ON family_log_diagnostics(created_at);
