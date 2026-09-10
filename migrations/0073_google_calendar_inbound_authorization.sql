-- Explicit read-only authorization for Google Calendar -> FamilyToDo import.
-- Keep this refresh token separate from external_calendar_accounts, which remains the
-- FamilyToDo -> app-owned Google Calendar outbound projection credential lane.
CREATE TABLE IF NOT EXISTS google_calendar_inbound_authorizations (
  family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  token_key_version TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_inbound_authorizations_member
  ON google_calendar_inbound_authorizations(member_id, status);
