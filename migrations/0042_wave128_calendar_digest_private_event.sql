-- Wave128: opt-in, recipient-specific LINE daily digest with idempotent receipts.
CREATE TABLE line_daily_digest_settings (
 family_id INTEGER PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 send_time TEXT NOT NULL DEFAULT '07:00',
 updated_by INTEGER,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);
CREATE TABLE line_daily_digest_recipients (
 family_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,member_id),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
 FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE TABLE line_daily_digest_receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 family_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 local_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','ERROR')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 sent_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(family_id,member_id,local_date),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
 FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX idx_line_digest_due ON line_daily_digest_receipts(status,local_date,attempt_count);
