-- Wave34: notification lifecycle cleanup and lookup index.
-- Safe to run after Wave33. No user-facing records are deleted; obsolete pending work is cancelled.
UPDATE notifications
SET status='cancelled', updated_at=created_at
WHERE status IN ('pending','retry')
  AND member_id IN (SELECT id FROM members WHERE active=0 OR notification_enabled=0);

UPDATE notifications
SET status='cancelled', updated_at=created_at
WHERE status IN ('pending','retry')
  AND target_type='task'
  AND (target_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id)
       OR EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id AND t.status='completed'));

UPDATE notifications
SET status='cancelled', updated_at=created_at
WHERE status IN ('pending','retry')
  AND target_type='message'
  AND (target_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM messages x WHERE x.id=notifications.target_id AND x.family_id=notifications.family_id));

CREATE INDEX IF NOT EXISTS idx_notifications_target_lifecycle
ON notifications(target_type, target_id, family_id, status);
