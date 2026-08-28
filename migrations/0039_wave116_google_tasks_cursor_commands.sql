ALTER TABLE external_google_task_accounts ADD COLUMN sync_window_updated_min TEXT;
ALTER TABLE external_google_task_accounts ADD COLUMN sync_page_token TEXT;
ALTER TABLE external_google_task_accounts ADD COLUMN sync_latest_seen_at TEXT;
ALTER TABLE external_google_task_accounts ADD COLUMN sync_cycle_started_at TEXT;

CREATE TABLE external_google_voice_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL, member_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
  external_tasklist_id TEXT NOT NULL, external_task_id TEXT NOT NULL,
  external_etag TEXT, external_due TEXT,
  command_type TEXT NOT NULL CHECK(command_type IN ('SHOPPING_ADD','FAMILY_LOG_RECORD','TASK_CREATE')),
  target_type TEXT CHECK(target_type IN ('shopping','family_log','task')), target_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('EXECUTED','NEEDS_REVIEW','ERROR')), error_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(account_id,external_tasklist_id,external_task_id),
  FOREIGN KEY(account_id) REFERENCES external_google_task_accounts(id),
  FOREIGN KEY(family_id) REFERENCES families(id), FOREIGN KEY(member_id) REFERENCES members(id)
);
CREATE INDEX idx_google_voice_commands_account_status ON external_google_voice_commands(account_id,status);
