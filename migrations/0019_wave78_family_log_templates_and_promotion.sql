-- Wave78: Family Log templates, recorder-driven task completion, and future member promotion.
-- Keeps Family Log subjects independent from LINE accounts until they are explicitly promoted.

ALTER TABLE family_log_subjects
ADD COLUMN auto_complete_linked_task INTEGER NOT NULL DEFAULT 0;

UPDATE family_log_subjects
SET auto_complete_linked_task=1
WHERE upper(COALESCE(subject_kind,'OTHER')) IN ('BABY','CHILD','PET');

ALTER TABLE family_invitations
ADD COLUMN family_log_subject_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_family_invitations_subject
ON family_invitations(family_id, family_log_subject_id, used_at, expires_at);
