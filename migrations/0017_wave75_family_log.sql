-- Wave75: Family Log MVP.
-- Keeps the existing task/event architecture intact and adds a separate chronological family-log domain.

CREATE TABLE IF NOT EXISTS family_log_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    member_id INTEGER NULL,
    name TEXT NOT NULL,
    subject_kind TEXT NOT NULL DEFAULT 'CHILD',
    birth_date TEXT NULL,
    icon TEXT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_family_log_subjects_family_active
ON family_log_subjects(family_id, active, id);

CREATE TABLE IF NOT EXISTS family_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    subject_id INTEGER NULL,
    log_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    detail_code TEXT NULL,
    amount REAL NULL,
    unit TEXT NULL,
    duration_minutes INTEGER NULL,
    value_text TEXT NULL,
    note TEXT NULL,
    linked_task_id INTEGER NULL,
    linked_occurrence_id INTEGER NULL,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_occurrence_id) REFERENCES recurrence_occurrences(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_family_logs_family_occurred
ON family_logs(family_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_family_logs_subject_occurred
ON family_logs(subject_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_family_logs_task
ON family_logs(linked_task_id);

CREATE INDEX IF NOT EXISTS idx_family_logs_occurrence
ON family_logs(linked_occurrence_id);

CREATE TABLE IF NOT EXISTS family_log_timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    subject_id INTEGER NULL,
    log_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    started_at_ms INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    note TEXT NULL,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES family_log_subjects(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_family_log_timers_family_status
ON family_log_timers(family_id, status, started_at_ms);
