CREATE TABLE IF NOT EXISTS task_create_tombstones (
    family_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    task_id INTEGER NOT NULL,
    PRIMARY KEY (family_id, member_id, scope, idempotency_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO task_create_tombstones(
    family_id,member_id,scope,idempotency_key,request_hash,task_id
)
SELECT family_id,member_id,scope,idempotency_key,request_hash,task_id
FROM task_create_requests
WHERE status='DONE' AND task_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_task_create_requests_done_tombstone
AFTER UPDATE OF status, task_id ON task_create_requests
WHEN NEW.status='DONE' AND NEW.task_id IS NOT NULL
BEGIN
    INSERT INTO task_create_tombstones(
        family_id,member_id,scope,idempotency_key,request_hash,task_id
    ) VALUES(
        NEW.family_id,NEW.member_id,NEW.scope,NEW.idempotency_key,NEW.request_hash,NEW.task_id
    );
END;
