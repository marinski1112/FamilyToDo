CREATE TABLE meal_live_sessions (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 member_id INTEGER NOT NULL,
 payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','READY','FAILED','ENDED')),
 model TEXT NOT NULL,
 token_cipher TEXT,
 error_code TEXT,
 expires_at INTEGER NOT NULL,
 new_session_expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX idx_meal_live_family_time ON meal_live_sessions(family_id,created_at);
CREATE INDEX idx_meal_live_active ON meal_live_sessions(family_id,status,expires_at);
