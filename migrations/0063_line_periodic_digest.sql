-- Weekly/month-end LINE family rollups reuse the opt-in daily digest family/recipient settings.
ALTER TABLE line_daily_digest_settings ADD COLUMN weekly_enabled INTEGER NOT NULL DEFAULT 1 CHECK(weekly_enabled IN (0,1));
ALTER TABLE line_daily_digest_settings ADD COLUMN weekly_send_time TEXT NOT NULL DEFAULT '20:30';
ALTER TABLE line_daily_digest_settings ADD COLUMN monthly_enabled INTEGER NOT NULL DEFAULT 1 CHECK(monthly_enabled IN (0,1));
ALTER TABLE line_daily_digest_settings ADD COLUMN monthly_send_time TEXT NOT NULL DEFAULT '20:45';

CREATE TABLE line_periodic_digest_receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 family_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 report_type TEXT NOT NULL CHECK(report_type IN ('WEEKLY','MONTHLY')),
 period_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','ERROR')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 last_error TEXT,
 sent_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(family_id,member_id,report_type,period_key),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE,
 FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX idx_line_periodic_digest_due ON line_periodic_digest_receipts(status,report_type,period_key,attempt_count);

CREATE TABLE line_periodic_digest_ai_reports (
 family_id INTEGER NOT NULL,
 report_type TEXT NOT NULL CHECK(report_type IN ('WEEKLY','MONTHLY')),
 period_key TEXT NOT NULL,
 request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count BETWEEN 0 AND 2),
 finalized INTEGER NOT NULL DEFAULT 0 CHECK(finalized IN (0,1)),
 frame_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,report_type,period_key),
 FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE
);
