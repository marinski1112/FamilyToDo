-- v12.35 runtime compatibility columns/tables detected from the shipped PHP source.
ALTER TABLE tasks ADD COLUMN start_at TEXT NULL;
ALTER TABLE tasks ADD COLUMN end_at TEXT NULL;
ALTER TABLE tasks ADD COLUMN location TEXT NULL;
ALTER TABLE tasks ADD COLUMN calendar_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN task_kind TEXT NULL;
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN label_color TEXT NULL;
ALTER TABLE tasks ADD COLUMN calendar_color TEXT NULL;
ALTER TABLE tasks ADD COLUMN due_type TEXT NULL;
ALTER TABLE tasks ADD COLUMN all_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN week_number INTEGER NULL;

ALTER TABLE items ADD COLUMN task_id INTEGER NULL;
ALTER TABLE items ADD COLUMN group_key TEXT NULL;

ALTER TABLE shopping_items ADD COLUMN task_id INTEGER NULL;
ALTER TABLE shopping_items ADD COLUMN url TEXT NULL;

ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE recurrence_rules ADD COLUMN week_number INTEGER NULL;
ALTER TABLE recurrence_rules ADD COLUMN business_day_ordinal INTEGER NULL;
ALTER TABLE recurrence_rules ADD COLUMN weekdays_json TEXT NULL;
ALTER TABLE recurrence_rules ADD COLUMN monthdays_json TEXT NULL;

CREATE TABLE IF NOT EXISTS recurrence_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    recurrence_rule_id INTEGER NOT NULL,
    occurrence_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_by INTEGER NULL,
    completed_at TEXT NULL,
    exception_task_id INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (family_id, recurrence_rule_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_tasks_family_start ON tasks(family_id, start_at);
CREATE INDEX IF NOT EXISTS idx_tasks_family_end ON tasks(family_id, end_at);
CREATE INDEX IF NOT EXISTS idx_tasks_calendar_visible ON tasks(family_id, calendar_visible);
CREATE INDEX IF NOT EXISTS idx_items_task ON items(task_id);
CREATE INDEX IF NOT EXISTS idx_shopping_task ON shopping_items(task_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(family_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_recurrence_occurrences_rule_date ON recurrence_occurrences(recurrence_rule_id, occurrence_date);
