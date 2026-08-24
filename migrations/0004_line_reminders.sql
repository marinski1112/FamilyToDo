-- Wave15: user-selectable LINE reminder time for tasks/messages.
ALTER TABLE tasks ADD COLUMN reminder_at TEXT NULL;
ALTER TABLE messages ADD COLUMN reminder_at TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks (family_id, reminder_at);
CREATE INDEX IF NOT EXISTS idx_messages_reminder ON messages (family_id, reminder_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications (status, notify_at, sent_at);
