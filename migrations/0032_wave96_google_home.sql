-- Wave96: Google Home Cloud-to-cloud account links and retry receipts.
CREATE TABLE google_home_authorization_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_google_home_codes_expiry ON google_home_authorization_codes(expires_at,used_at);

CREATE TABLE google_home_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at INTEGER NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_google_home_tokens_link ON google_home_tokens(family_id,member_id,revoked_at);

CREATE TABLE external_command_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUCCESS','ERROR')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider,request_id,command_key)
);
CREATE INDEX idx_external_command_receipts_family ON external_command_receipts(provider,family_id,created_at);
