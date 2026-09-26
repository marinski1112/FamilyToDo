ALTER TABLE family_log_media_cleanup_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DEAD'));
ALTER TABLE family_log_media_cleanup_queue ADD COLUMN next_attempt_at TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_family_log_media_cleanup_due ON family_log_media_cleanup_queue(family_id,status,next_attempt_at,id);
CREATE INDEX IF NOT EXISTS idx_family_log_media_pending_global ON family_log_media(reconcile_pending,id);
CREATE TABLE IF NOT EXISTS family_log_media_cleanup_cursor (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  queue_id INTEGER NOT NULL DEFAULT 0,
  media_id INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO family_log_media_cleanup_cursor(singleton,queue_id,media_id) VALUES(1,0,0);
