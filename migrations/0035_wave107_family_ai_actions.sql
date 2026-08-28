-- Wave107: signed Family AI actions are claimed once before domain execution.
CREATE TABLE family_ai_action_receipts (
  nonce TEXT PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  action TEXT NOT NULL CHECK(action IN ('CREATE_TASK','CREATE_EVENT','COMPLETE_TASK','RECORD_QUICK_CHORE','RECORD_FAMILY_LOG','START_SLEEP','STOP_SLEEP')),
  status TEXT NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','FAILED')),
  provider TEXT NOT NULL CHECK(provider IN ('GEMINI','WORKERS_AI')),
  target_type TEXT,
  target_id INTEGER,
  result_json TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_family_ai_receipts_family_created ON family_ai_action_receipts(family_id,created_at);
