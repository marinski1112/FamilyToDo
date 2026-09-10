ALTER TABLE family_daily_journals ADD COLUMN ai_summary_text TEXT;
ALTER TABLE family_daily_journals ADD COLUMN ai_model TEXT;
ALTER TABLE family_daily_journals ADD COLUMN ai_status TEXT;
ALTER TABLE family_daily_journals ADD COLUMN ai_generated_at TEXT;
ALTER TABLE family_daily_journals ADD COLUMN ai_source_content_version INTEGER;
ALTER TABLE family_daily_journals ADD COLUMN ai_location_member_ids_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_family_daily_journals_ai_refresh
ON family_daily_journals(storage_tier, journal_date DESC, ai_generated_at);
