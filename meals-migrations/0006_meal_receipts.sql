CREATE TABLE receipt_imports (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','READY')),
 mode TEXT NOT NULL CHECK(mode IN ('PHOTO','MANUAL')),
 error_code TEXT,
 created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX receipt_imports_family_created ON receipt_imports(family_id,created_at);
CREATE TABLE receipt_items (
 family_id INTEGER NOT NULL,
 import_id TEXT NOT NULL,
 item_index INTEGER NOT NULL,
 label TEXT NOT NULL,
 package_count INTEGER,
 confidence TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED')),
 lot_id TEXT,
 confirmed_hash TEXT,
 confirmation_token TEXT,
 confirmed_json TEXT CHECK(confirmed_json IS NULL OR json_valid(confirmed_json)),
 PRIMARY KEY(family_id,import_id,item_index),
 FOREIGN KEY(family_id,import_id) REFERENCES receipt_imports(family_id,id)
);
