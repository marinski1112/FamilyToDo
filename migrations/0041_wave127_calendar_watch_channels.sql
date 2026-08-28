-- Wave127: Google Calendar push notification channels (tokens are stored only as SHA-256 hashes).
CREATE TABLE external_calendar_watch_channels (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 family_id INTEGER NOT NULL,
 provider TEXT NOT NULL DEFAULT 'GOOGLE_CALENDAR',
 calendar_id TEXT NOT NULL,
 channel_id TEXT NOT NULL UNIQUE,
 resource_id TEXT NOT NULL,
 token_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','STOPPED','EXPIRED')),
 last_notification_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_calendar_watch_active_resource ON external_calendar_watch_channels(channel_id,resource_id);
CREATE INDEX idx_calendar_watch_renewal ON external_calendar_watch_channels(status,expires_at);
CREATE INDEX idx_calendar_watch_family ON external_calendar_watch_channels(family_id,provider,status);
