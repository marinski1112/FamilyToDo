-- Prevent overlapping scheduled notification workers from concurrently owning the same delivery.
-- Delivery lifecycle status remains pending/retry/sent/error; these nullable columns only fence active workers.
ALTER TABLE notifications ADD COLUMN delivery_lease_token TEXT NULL;
ALTER TABLE notifications ADD COLUMN delivery_lease_expires_at TEXT NULL;
