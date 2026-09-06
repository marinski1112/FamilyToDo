-- Weekly/month-end LINE family rollups reuse the existing daily-digest opt-in and recipients.
-- A separate ledger prevents overlap with the one-row-per-local-date morning receipt contract.
CREATE TABLE IF NOT EXISTS line_periodic_digest_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  digest_kind TEXT NOT NULL CHECK(digest_kind IN ('WEEKLY','MONTHLY')),
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','ERROR')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,member_id,digest_kind,period_key),
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_periodic_digest_due
ON line_periodic_digest_receipts(status,digest_kind,period_key,attempt_count);
