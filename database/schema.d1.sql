-- Cloudflare D1 migration generated from FamilyTODO v12.35 MySQL schema.
-- SQLite/D1 representation: BIGINT/INT/TINYINT -> INTEGER, DATETIME/DATE/JSON/VARCHAR/CHAR -> TEXT.
-- This migration is intentionally separate from the original MySQL schema.

-- Family TODO LINE static deployment schema
-- Derived from installer2-1.php and installer3.php.
-- Import after installer1.php has created app/config.php and the base users table.

CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_code TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (family_code)
);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,

    line_user_id TEXT NULL,

    name TEXT NOT NULL,

    member_type TEXT NOT NULL DEFAULT 'ADULT',

    role TEXT NOT NULL DEFAULT 'MEMBER',

    icon TEXT NULL,

    notification_enabled INTEGER
        NOT NULL DEFAULT 1,

    active INTEGER
        NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,
    title TEXT NOT NULL,

    description TEXT NULL,

    due_at TEXT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    completion_mode TEXT NOT NULL DEFAULT 'ANY',

    completed_by INTEGER NULL,

    completed_at TEXT NULL,

    recurrence_rule TEXT NULL,

    source_template_id INTEGER NULL,

    reminder_at TEXT NULL,

    created_by INTEGER NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,

    PRIMARY KEY (
        task_id,
        member_id
    ),

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    task_id INTEGER NOT NULL,

    member_id INTEGER NOT NULL,

    action TEXT NOT NULL,

    occurred_at TEXT NOT NULL,

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,

    memo TEXT NULL,

    due_at TEXT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    completion_mode TEXT NOT NULL DEFAULT 'ANY',

    completed_by INTEGER NULL,

    completed_at TEXT NULL,

    created_by INTEGER NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS item_assignees (
    item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,

    PRIMARY KEY (
        item_id,
        member_id
    ),

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    item_id INTEGER NOT NULL,

    member_id INTEGER NOT NULL,

    action TEXT NOT NULL,

    occurred_at TEXT NOT NULL,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,

    quantity TEXT NULL,

    category TEXT NULL,

    memo TEXT NULL,

    due_date TEXT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    completed_by INTEGER NULL,

    completed_at TEXT NULL,

    created_by INTEGER NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shopping_assignees (
    shopping_item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,

    PRIMARY KEY (
        shopping_item_id,
        member_id
    ),

    FOREIGN KEY (shopping_item_id)
        REFERENCES shopping_items(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopping_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    shopping_item_id INTEGER NOT NULL,

    member_id INTEGER NOT NULL,

    action TEXT NOT NULL,

    occurred_at TEXT NOT NULL,

    FOREIGN KEY (shopping_item_id)
        REFERENCES shopping_items(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,
    sender_id INTEGER NULL,

    target_member_id INTEGER NULL,

    text TEXT NOT NULL,

    reminder_at TEXT NULL,

    converted_to_shopping_id
        INTEGER NULL,

    converted_to_task_id
        INTEGER NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (sender_id)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (target_member_id)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (converted_to_shopping_id)
        REFERENCES shopping_items(id)
        ON DELETE SET NULL,

    FOREIGN KEY (converted_to_task_id)
        REFERENCES tasks(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recurring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,

    title TEXT NOT NULL,

    description TEXT NULL,

    recurrence_type TEXT NOT NULL,

    interval_value INTEGER NULL,

    weekday INTEGER NULL,

    month_day INTEGER NULL,

    week_number INTEGER NULL,

    start_date TEXT NOT NULL,

    end_date TEXT NULL,
    completion_mode TEXT NOT NULL DEFAULT 'ANY',

    active INTEGER
        NOT NULL DEFAULT 1,

    created_by INTEGER NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,

    member_id INTEGER NOT NULL,

    type TEXT NOT NULL,

    target_type TEXT NULL,

    target_id INTEGER NULL,

    notify_at TEXT NOT NULL,

    sent_at TEXT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    message TEXT NULL,

    created_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_settings (
    family_id INTEGER NOT NULL,

    setting_key TEXT NOT NULL,

    setting_value TEXT NULL,

    updated_at TEXT NOT NULL,

    PRIMARY KEY (
        family_id,
        setting_key
    ),

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,

    member_id INTEGER NULL,

    action TEXT NOT NULL,

    target_type TEXT NULL,

    target_id INTEGER NULL,

    metadata TEXT NULL,

    occurred_at TEXT NOT NULL,

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS family_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    family_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL,

    created_by INTEGER NULL,

    expires_at TEXT NULL,

    used_at TEXT NULL,

    used_by INTEGER NULL,

    created_at TEXT NOT NULL,

    UNIQUE (
        token_hash
    ),

    FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    FOREIGN KEY (used_by)
        REFERENCES members(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL DEFAULT 'completed',
    completed_at TEXT NOT NULL,
    UNIQUE (task_id, member_id)
);

CREATE TABLE IF NOT EXISTS item_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL DEFAULT 'completed',
    completed_at TEXT NOT NULL,
    UNIQUE (item_id, member_id)
);

CREATE TABLE IF NOT EXISTS shopping_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopping_item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL DEFAULT 'completed',
    completed_at TEXT NOT NULL,
    UNIQUE (shopping_item_id, member_id)
);

CREATE TABLE IF NOT EXISTS recurrence_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    task_id INTEGER NULL,
    name TEXT NOT NULL,
    recurrence_type TEXT NOT NULL,
    interval_value INTEGER NOT NULL DEFAULT 1,
    weekday TINYINT NULL,
    monthday TINYINT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    member_id INTEGER NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    source_type TEXT NULL,
    source_id INTEGER NULL,
    archived_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_completion_family_time
    ON deleted_completion_history(family_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_deleted_completion_entity
    ON deleted_completion_history(family_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    before_day INTEGER NOT NULL DEFAULT 1,
    morning INTEGER NOT NULL DEFAULT 1,
    one_hour_before INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        family_id,
        member_id
    )
);

CREATE INDEX IF NOT EXISTS idx_members_family_id ON members (family_id);

CREATE INDEX IF NOT EXISTS idx_members_line_user_id ON members (line_user_id);

CREATE INDEX IF NOT EXISTS idx_members_active ON members (family_id, active);





CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks (family_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (family_id, due_at);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (family_id, status);


CREATE INDEX IF NOT EXISTS idx_tasks_completed_by ON tasks (completed_by);

CREATE INDEX IF NOT EXISTS idx_task_assignees_member ON task_assignees (member_id);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_completion_history (task_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_task_history_member ON task_completion_history (member_id);

CREATE INDEX IF NOT EXISTS idx_items_family ON items (family_id);

CREATE INDEX IF NOT EXISTS idx_items_due ON items (family_id, due_at);


CREATE INDEX IF NOT EXISTS idx_items_status ON items (family_id, status);

CREATE INDEX IF NOT EXISTS idx_item_assignees_member ON item_assignees (member_id);

CREATE INDEX IF NOT EXISTS idx_item_history_item ON item_completion_history (item_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_item_history_member ON item_completion_history (member_id);

CREATE INDEX IF NOT EXISTS idx_shopping_family ON shopping_items (family_id);

CREATE INDEX IF NOT EXISTS idx_shopping_due ON shopping_items (family_id, due_date);

CREATE INDEX IF NOT EXISTS idx_shopping_status ON shopping_items (family_id, status);


CREATE INDEX IF NOT EXISTS idx_shopping_assignees_member ON shopping_assignees (member_id);

CREATE INDEX IF NOT EXISTS idx_shopping_history_item ON shopping_completion_history (shopping_item_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_shopping_history_member ON shopping_completion_history (member_id);

CREATE INDEX IF NOT EXISTS idx_messages_family ON messages (family_id, created_at);


CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_target ON messages (target_member_id);

CREATE INDEX IF NOT EXISTS idx_recurring_family ON recurring_tasks (family_id);

CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_tasks (family_id, active);

CREATE INDEX IF NOT EXISTS idx_notifications_member ON notifications (member_id, notify_at);

CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications (status, notify_at);

CREATE INDEX IF NOT EXISTS idx_notifications_family ON notifications (family_id);

CREATE INDEX IF NOT EXISTS idx_activity_family ON activity_logs (family_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_activity_member ON activity_logs (member_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_activity_target ON activity_logs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_family_invitation_family ON family_invitations (family_id);

CREATE INDEX IF NOT EXISTS idx_family_invitation_expires ON family_invitations (expires_at);

CREATE INDEX IF NOT EXISTS idx_task_completion_task ON task_completions (task_id);

CREATE INDEX IF NOT EXISTS idx_task_completion_member ON task_completions (member_id);

CREATE INDEX IF NOT EXISTS idx_item_completion_item ON item_completions (item_id);

CREATE INDEX IF NOT EXISTS idx_shopping_completion_item ON shopping_completions (shopping_item_id);

CREATE INDEX IF NOT EXISTS idx_recurrence_family ON recurrence_rules (family_id);

CREATE INDEX IF NOT EXISTS idx_recurrence_active ON recurrence_rules (active);
