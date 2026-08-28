-- Wave112: expire-able apply lease and one active batch per member/file.
-- Keep the most advanced batch (then newest id) without deleting provenance.
UPDATE calendar_import_batches AS duplicate
SET status = 'FAILED'
WHERE status = 'IMPORTING'
  AND EXISTS (
    SELECT 1 FROM calendar_import_batches AS canonical
    WHERE canonical.family_id = duplicate.family_id
      AND canonical.created_by = duplicate.created_by
      AND canonical.file_sha256 = duplicate.file_sha256
      AND canonical.status = 'IMPORTING'
      AND (canonical.processed_count > duplicate.processed_count
        OR (canonical.processed_count = duplicate.processed_count AND canonical.id > duplicate.id))
  );

ALTER TABLE calendar_import_batches ADD COLUMN lease_token TEXT;
ALTER TABLE calendar_import_batches ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE calendar_import_batches ADD COLUMN normalization_mode TEXT NOT NULL DEFAULT 'NONE';

CREATE UNIQUE INDEX idx_calendar_import_one_active_file
ON calendar_import_batches(family_id, created_by, file_sha256)
WHERE status = 'IMPORTING';
