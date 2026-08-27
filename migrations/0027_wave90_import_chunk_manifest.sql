-- Wave90: compact provenance manifest (one hash/count entry per 100-record chunk).
ALTER TABLE family_log_import_batches ADD COLUMN chunk_manifest_json TEXT NULL;
