-- Support bounded family-independent retry of R2 deletions queued by message deletion.
-- The existing (family_id,state,created_at) index remains for per-family cleanup.
CREATE INDEX idx_message_photos_global_cleanup
  ON message_photos(state,writers,created_at,upload_id);
