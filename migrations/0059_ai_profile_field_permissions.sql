-- Field-level permissions for optional personalized AI profile context.
-- The existing ai_personalization_enabled remains the per-subject master switch.
-- Values are a JSON array from the server allowlist; NULL/[] authorizes no profile fields.
ALTER TABLE family_log_subjects ADD COLUMN ai_profile_permissions_json TEXT NULL;
