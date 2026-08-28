-- Wave115: per-member Google Tasks voice inbox (inbound only).
CREATE TABLE external_google_task_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  token_key_version TEXT NOT NULL DEFAULT 'v1',
  tasklist_id TEXT,
  tasklist_name TEXT,
  status TEXT NOT NULL DEFAULT 'NEEDS_LIST' CHECK(status IN ('NEEDS_LIST','ACTIVE','SYNCING','REVOKED','ERROR')),
  import_visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK(import_visibility IN ('PRIVATE','FAMILY')),
  sync_started_at TEXT NOT NULL,
  last_sync_at TEXT,
  updated_min TEXT NOT NULL,
  sync_lease_token TEXT,
  sync_lease_expires_at INTEGER,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(family_id,member_id)
);
CREATE INDEX idx_google_task_accounts_sync ON external_google_task_accounts(status,last_sync_at);

CREATE TABLE external_google_task_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES external_google_task_accounts(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  external_tasklist_id TEXT NOT NULL,
  external_task_id TEXT NOT NULL,
  external_etag TEXT,
  external_updated_at TEXT,
  imported_task_updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONFLICT','COMPLETED','TOMBSTONE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(account_id,external_tasklist_id,external_task_id)
);
CREATE INDEX idx_google_task_links_task ON external_google_task_links(family_id,task_id);
