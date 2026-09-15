-- Prevent concurrent/retried message conversions from creating duplicate domain rows.
--
-- Claims serialize one conversion type per message. source_message_id on newly created
-- Shopping/Task rows closes the crash window between domain INSERT and claim finalization:
-- a retry reuses the already-created row instead of inserting another one.

ALTER TABLE shopping_items ADD COLUMN source_message_id INTEGER NULL;
ALTER TABLE tasks ADD COLUMN source_message_id INTEGER NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_source_message
ON shopping_items(family_id, source_message_id)
WHERE source_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_message
ON tasks(family_id, source_message_id)
WHERE source_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_conversion_claims (
    message_id INTEGER NOT NULL,
    family_id INTEGER NOT NULL,
    conversion_type TEXT NOT NULL CHECK (conversion_type IN ('shopping','task')),
    conversion_mode TEXT NOT NULL,
    target_id INTEGER NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','DONE')),
    lease_token TEXT NULL,
    lease_expires_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, conversion_type),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_conversion_claims_family_status
ON message_conversion_claims(family_id, status, updated_at);
