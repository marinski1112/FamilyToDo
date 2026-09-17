-- Durable request ledger for POST /api/task creation idempotency.
--
-- The client key is scoped by family/member/operation. A short lease serializes
-- concurrent processors, while tasks.create_request_id gives the transaction a
-- stable local identity for linked rows and replay recovery.

CREATE TABLE IF NOT EXISTS task_create_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    task_id INTEGER NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING'
        CHECK (status IN ('PROCESSING','DONE','ERROR')),
    lease_token TEXT NULL,
    lease_expires_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (family_id, member_id, scope, idempotency_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

ALTER TABLE tasks ADD COLUMN create_request_id INTEGER NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_create_request
ON tasks(create_request_id)
WHERE create_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_create_requests_family_status
ON task_create_requests(family_id, status, lease_expires_at);
