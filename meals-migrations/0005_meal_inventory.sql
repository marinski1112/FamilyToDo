CREATE TABLE meal_inventory_state (
 family_id INTEGER PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE inventory_lots (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 name TEXT NOT NULL,
 tracking TEXT NOT NULL CHECK(tracking IN ('EXACT','APPROXIMATE','PRESENCE','UNTRACKED')),
 remaining_ticks INTEGER NOT NULL CHECK(remaining_ticks BETWEEN 0 AND 1000000000),
 unit TEXT NOT NULL,
 present INTEGER NOT NULL CHECK(present IN (0,1)),
 storage TEXT NOT NULL CHECK(storage IN ('PANTRY','FRIDGE','FREEZER')),
 purchased_on TEXT NOT NULL,
 expires_on TEXT,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision TEXT NOT NULL,
 created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE INDEX inventory_lots_family_active ON inventory_lots(family_id,archived,expires_on,id);
CREATE TRIGGER inventory_lots_insert_revision AFTER INSERT ON inventory_lots BEGIN
 INSERT INTO meal_inventory_state(family_id,revision) VALUES(NEW.family_id,1) ON CONFLICT(family_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER inventory_lots_update_revision AFTER UPDATE ON inventory_lots BEGIN
 INSERT INTO meal_inventory_state(family_id,revision) VALUES(NEW.family_id,1) ON CONFLICT(family_id) DO UPDATE SET revision=revision+1;
END;
CREATE TABLE meal_inventory_operations (
 family_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 operation_token TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,id)
);
CREATE TABLE inventory_events (
 family_id INTEGER NOT NULL,
 operation_id TEXT NOT NULL,
 lot_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('ADD','ADJUST','ARCHIVE','CONSUME')),
 before_ticks INTEGER NOT NULL,
 after_ticks INTEGER NOT NULL,
 unit TEXT NOT NULL,
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
 created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(family_id,operation_id,lot_id)
);
CREATE INDEX inventory_events_family_lot ON inventory_events(family_id,lot_id,created_at);
ALTER TABLE cooked_events ADD COLUMN operation_id TEXT;
ALTER TABLE cooked_events ADD COLUMN inventory_result_json TEXT CHECK(inventory_result_json IS NULL OR json_valid(inventory_result_json));
