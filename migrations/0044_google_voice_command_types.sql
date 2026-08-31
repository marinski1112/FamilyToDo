PRAGMA foreign_keys=OFF;

CREATE TABLE external_google_voice_commands_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  external_tasklist_id TEXT NOT NULL,
  external_task_id TEXT NOT NULL,
  external_etag TEXT,
  external_due TEXT,
  command_type TEXT NOT NULL CHECK(command_type IN (
    'SHOPPING_ADD',
    'FAMILY_LOG_RECORD',
    'TASK_CREATE',
    'TASK_COMPLETE',
    'SHOPPING_COMPLETE',
    'INQUIRY'
  )),
  target_type TEXT CHECK(target_type IN ('shopping','family_log','task')),
  target_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('EXECUTED','NEEDS_REVIEW','ERROR')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id,external_tasklist_id,external_task_id),
  FOREIGN KEY(account_id) REFERENCES external_google_task_accounts(id),
  FOREIGN KEY(family_id) REFERENCES families(id),
  FOREIGN KEY(member_id) REFERENCES members(id)
);

INSERT INTO external_google_voice_commands_next(
  id,family_id,member_id,account_id,external_tasklist_id,external_task_id,
  external_etag,external_due,command_type,target_type,target_id,status,error_code,
  created_at,updated_at
)
SELECT
  id,family_id,member_id,account_id,external_tasklist_id,external_task_id,
  external_etag,external_due,command_type,target_type,target_id,status,error_code,
  created_at,updated_at
FROM external_google_voice_commands;

DROP TABLE external_google_voice_commands;
ALTER TABLE external_google_voice_commands_next RENAME TO external_google_voice_commands;
CREATE INDEX idx_google_voice_commands_account_status ON external_google_voice_commands(account_id,status);

PRAGMA foreign_keys=ON;
