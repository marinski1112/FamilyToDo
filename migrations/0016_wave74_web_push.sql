-- Wave74: PWA / Web Push subscription foundation.
-- Existing LINE notifications remain the default delivery channel.

ALTER TABLE members ADD COLUMN notification_channel TEXT NOT NULL DEFAULT 'LINE';

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_success_at TEXT NULL,
    last_error TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(member_id, endpoint),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_web_push_member_enabled
ON web_push_subscriptions(member_id, enabled, updated_at);

CREATE INDEX IF NOT EXISTS idx_web_push_family
ON web_push_subscriptions(family_id, member_id);
