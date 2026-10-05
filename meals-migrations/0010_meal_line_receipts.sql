-- Only explicitly armed individual LINE chats can enqueue one receipt image.
CREATE TABLE meal_line_receipt_modes (
 family_id INTEGER NOT NULL, member_id INTEGER NOT NULL,
 command_id TEXT NOT NULL, sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 consumed_id TEXT,
 PRIMARY KEY(family_id,member_id)
);
CREATE TABLE meal_line_receipts (
 family_id INTEGER NOT NULL, id TEXT NOT NULL, created_by INTEGER NOT NULL,
 source_cipher TEXT, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONSUMED','DISMISSED','EXPIRED')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX meal_line_receipts_pending ON meal_line_receipts(family_id,status,created_at DESC);
CREATE INDEX meal_line_receipts_expiry ON meal_line_receipts(expires_at) WHERE source_cipher IS NOT NULL;
CREATE INDEX meal_line_receipts_daily ON meal_line_receipts(family_id,created_at);
