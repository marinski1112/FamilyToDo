-- Optional family member/subject profile metadata for future personalized household prose.
-- These values are never AI inputs merely by being stored; explicit opt-in and a later
-- bounded projection are required before any profile field may leave the application.

ALTER TABLE family_log_subjects ADD COLUMN sex_gender TEXT NULL;
ALTER TABLE family_log_subjects ADD COLUMN birthplace TEXT NULL;
ALTER TABLE family_log_subjects ADD COLUMN blood_type TEXT NULL;
ALTER TABLE family_log_subjects ADD COLUMN personality_note TEXT NULL;
ALTER TABLE family_log_subjects ADD COLUMN ai_personalization_enabled INTEGER NOT NULL DEFAULT 0;
