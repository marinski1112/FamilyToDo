-- Wave39: lifecycle hardening for recurring tasks, notifications and member history.
-- No historical activity/completion rows are removed.
ALTER TABLE recurrence_rules ADD COLUMN reminder_minutes INTEGER NULL;
ALTER TABLE recurrence_rules ADD COLUMN deleted_at TEXT NULL;

-- Remove duplicate operational reminders before enforcing one active reminder per recipient/target/time.
DELETE FROM notifications
WHERE id IN (
  SELECT n2.id
  FROM notifications n2
  JOIN notifications n1
    ON n1.member_id=n2.member_id
   AND n1.target_type=n2.target_type
   AND n1.target_id=n2.target_id
   AND n1.notify_at=n2.notify_at
   AND n1.status IN ('pending','retry')
   AND n2.status IN ('pending','retry')
   AND n1.id<n2.id
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_pending_target_time
ON notifications(member_id,target_type,target_id,notify_at)
WHERE status IN ('pending','retry');

CREATE INDEX IF NOT EXISTS idx_recurrence_rules_lifecycle
ON recurrence_rules(family_id,active,deleted_at,start_date,end_date);
