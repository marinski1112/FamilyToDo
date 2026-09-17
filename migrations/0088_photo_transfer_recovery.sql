ALTER TABLE photo_transfers ADD COLUMN recovery_token_hash TEXT;
ALTER TABLE photo_transfers ADD COLUMN recovery_expires_at INTEGER;
ALTER TABLE photo_transfers ADD COLUMN recovery_reads INTEGER NOT NULL DEFAULT 0 CHECK(recovery_reads BETWEEN 0 AND 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_transfers_recovery_token_hash
ON photo_transfers(recovery_token_hash)
WHERE recovery_token_hash IS NOT NULL;
