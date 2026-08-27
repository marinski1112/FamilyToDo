-- Wave77: per-subject Family Log view/profile settings.
-- Existing log types remain available; enabled_types_json controls the subject's quick-entry UI.

ALTER TABLE family_log_subjects
ADD COLUMN enabled_types_json TEXT NULL;


-- Existing subjects that already have baby-care records are promoted to the baby UI preset.
UPDATE family_log_subjects
SET subject_kind='BABY'
WHERE upper(COALESCE(subject_kind,'CHILD'))='CHILD'
  AND EXISTS(
    SELECT 1
    FROM family_logs l
    WHERE l.subject_id=family_log_subjects.id
      AND l.deleted_at IS NULL
      AND upper(l.log_type) IN ('MILK','BREASTFEED','DIAPER')
  );

CREATE INDEX IF NOT EXISTS idx_family_log_subjects_member
ON family_log_subjects(family_id, member_id, active);
