-- Counts contain no prompts, responses, keys, profile data or raw errors.
CREATE TABLE ai_call_budgets (
 scope TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
 blocked_until TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(scope,day)
);
CREATE INDEX idx_ai_call_budgets_day ON ai_call_budgets(day);
CREATE TABLE ai_call_daily (
 family_id INTEGER NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL,
 trigger_kind TEXT NOT NULL, day TEXT NOT NULL,
 calls INTEGER NOT NULL DEFAULT 0, success INTEGER NOT NULL DEFAULT 0,
 rate_limit INTEGER NOT NULL DEFAULT 0, upstream_error INTEGER NOT NULL DEFAULT 0,
 fallback INTEGER NOT NULL DEFAULT 0, skipped_budget INTEGER NOT NULL DEFAULT 0,
 skipped_dedupe INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(family_id,feature,model,trigger_kind,day)
);
CREATE INDEX idx_ai_call_daily_day ON ai_call_daily(day);
