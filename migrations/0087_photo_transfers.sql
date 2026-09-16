-- Explicit selected-photo capabilities. Raw tokens are never stored.
CREATE TABLE photo_transfers (
 token_hash TEXT PRIMARY KEY,
 family_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('message','journal')),
 source_id INTEGER NOT NULL,
 caption TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 remaining_reads INTEGER NOT NULL DEFAULT 3 CHECK(remaining_reads >= 0)
);
CREATE INDEX photo_transfers_expiry ON photo_transfers(expires_at);
