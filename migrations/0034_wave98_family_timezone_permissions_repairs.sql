-- Wave98: naive application datetimes are family-local wall-clock values.
ALTER TABLE families ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';

CREATE TABLE member_permissions (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL CHECK(permission_key IN ('MANAGE_QUICK_CHORES')),
  granted_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  UNIQUE(member_id,permission_key)
);
CREATE INDEX idx_member_permissions_family ON member_permissions(family_id,permission_key,member_id);

CREATE TABLE family_log_time_repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  import_batch_id INTEGER NOT NULL REFERENCES family_log_import_batches(id) ON DELETE CASCADE,
  repair_type TEXT NOT NULL,
  repair_reason TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  affected_count INTEGER NOT NULL,
  skipped_edited_count INTEGER NOT NULL DEFAULT 0,
  performed_by INTEGER NOT NULL REFERENCES members(id),
  performed_at TEXT NOT NULL,
  rolled_back_by INTEGER REFERENCES members(id),
  rolled_back_at TEXT,
  UNIQUE(import_batch_id,repair_type)
);
