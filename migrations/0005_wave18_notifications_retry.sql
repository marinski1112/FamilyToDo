-- Wave18: notification retry state for Cron/LINE delivery failures
ALTER TABLE notifications ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN last_error TEXT NULL;
ALTER TABLE notifications ADD COLUMN updated_at TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_retry ON notifications(status, notify_at, attempt_count);

CREATE TABLE IF NOT EXISTS shopping_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(family_id,name),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shopping_categories_family ON shopping_categories(family_id,name);
