-- Wave 3 indexes for recurring tasks, invitations and scheduled notifications.
CREATE INDEX IF NOT EXISTS idx_recurrence_family_active ON recurrence_rules(family_id, active, start_date);
CREATE INDEX IF NOT EXISTS idx_invitation_hash ON family_invitations(token_hash, used_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_due ON notifications(status, sent_at, notify_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_family_time ON activity_logs(family_id, occurred_at);
