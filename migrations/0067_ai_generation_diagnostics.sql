CREATE TABLE IF NOT EXISTS ai_generation_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  feature TEXT NOT NULL CHECK(feature IN ('ROUGH_INPUT','MORNING_DIGEST')),
  occurred_at TEXT NOT NULL,
  final_status TEXT NOT NULL CHECK(final_status IN ('AI_NOT_NEEDED','AI_OK','FALLBACK_DETERMINISTIC','BUDGET_OR_CIRCUIT','NOT_CONFIGURED','DISABLED','STORAGE')),
  ai_called INTEGER NOT NULL DEFAULT 0 CHECK(ai_called IN (0,1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0 AND attempt_count <= 4),
  accepted_model TEXT,
  item_count INTEGER CHECK(item_count IS NULL OR (item_count >= 0 AND item_count <= 100)),
  attempts_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_diagnostics_family_feature_id
  ON ai_generation_diagnostics(family_id, feature, id DESC);
