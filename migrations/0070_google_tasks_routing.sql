-- A routed Google item is a create-once command, distinct from ordinary task sync.
CREATE TABLE google_tasks_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES external_google_task_accounts(id),
  family_id INTEGER NOT NULL REFERENCES families(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  list_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  etag TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('TASK','SHOPPING','ITEM')),
  status TEXT NOT NULL CHECK(status IN ('PENDING','EXECUTED','NEEDS_REVIEW')),
  reason TEXT,
  claim TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id,list_id,external_id)
);
CREATE INDEX idx_google_tasks_routes_recent ON google_tasks_routes(account_id,updated_at DESC);
ALTER TABLE tasks ADD COLUMN google_tasks_route_id INTEGER REFERENCES google_tasks_routes(id);
CREATE INDEX idx_tasks_google_route ON tasks(google_tasks_route_id);
