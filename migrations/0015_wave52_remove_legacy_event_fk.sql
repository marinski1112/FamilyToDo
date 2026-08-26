-- Family TODO LINE Wave52
-- Wave33で events / event_members は物理削除済みだが、SQLite/D1では
-- 子テーブル側の event_id 列と REFERENCES events(id) が残存していた。
-- そのため現行の INSERT/UPDATE が "no such table: main.events" で失敗する。
-- アプリケーションは既に task-only で event_id を参照していないため、
-- 既存データを保持したまま legacy event_id/FK を完全除去する。
--
-- D1 は foreign_keys=ON が常時有効。テーブル再構築中の一時的不整合は
-- defer_foreign_keys で遅延する。親テーブル DROP による CASCADE を避けるため、
-- 先にFK子テーブルをバックアップして削除し、親再構築後に復元する。

PRAGMA defer_foreign_keys = ON;

-- ---------------------------------------------------------
-- 1) FK子テーブルと messages を退避
-- ---------------------------------------------------------
CREATE TABLE _wave52_task_assignees AS SELECT * FROM task_assignees;
CREATE TABLE _wave52_task_completion_history AS SELECT * FROM task_completion_history;
CREATE TABLE _wave52_item_assignees AS SELECT * FROM item_assignees;
CREATE TABLE _wave52_item_completion_history AS SELECT * FROM item_completion_history;
CREATE TABLE _wave52_shopping_assignees AS SELECT * FROM shopping_assignees;
CREATE TABLE _wave52_shopping_completion_history AS SELECT * FROM shopping_completion_history;
CREATE TABLE _wave52_messages AS SELECT * FROM messages;

DROP TABLE messages;
DROP TABLE task_assignees;
DROP TABLE task_completion_history;
DROP TABLE item_assignees;
DROP TABLE item_completion_history;
DROP TABLE shopping_assignees;
DROP TABLE shopping_completion_history;

-- ---------------------------------------------------------
-- 2) tasks: event_id / events FK を除去して再構築
-- ---------------------------------------------------------
CREATE TABLE tasks_wave52 (
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
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    start_at TEXT NULL,
    end_at TEXT NULL,
    location TEXT NULL,
    calendar_visible INTEGER NOT NULL DEFAULT 1,
    task_kind TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label_color TEXT NULL,
    calendar_color TEXT NULL,
    due_type TEXT NULL,
    all_day INTEGER NOT NULL DEFAULT 1,
    week_number INTEGER NULL,
    reminder_at TEXT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

INSERT INTO tasks_wave52 (
    id,family_id,title,description,due_at,status,completion_mode,
    completed_by,completed_at,recurrence_rule,source_template_id,created_by,
    created_at,updated_at,start_at,end_at,location,calendar_visible,task_kind,
    sort_order,label_color,calendar_color,due_type,all_day,week_number,reminder_at
)
SELECT
    id,family_id,title,description,due_at,status,completion_mode,
    completed_by,completed_at,recurrence_rule,source_template_id,created_by,
    created_at,updated_at,start_at,end_at,location,calendar_visible,task_kind,
    sort_order,label_color,calendar_color,due_type,all_day,week_number,reminder_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_wave52 RENAME TO tasks;

CREATE INDEX idx_tasks_family ON tasks (family_id);
CREATE INDEX idx_tasks_due ON tasks (family_id, due_at);
CREATE INDEX idx_tasks_status ON tasks (family_id, status);
CREATE INDEX idx_tasks_completed_by ON tasks (completed_by);
CREATE INDEX idx_tasks_family_start ON tasks(family_id, start_at);
CREATE INDEX idx_tasks_family_end ON tasks(family_id, end_at);
CREATE INDEX idx_tasks_calendar_visible ON tasks(family_id, calendar_visible);
CREATE INDEX idx_tasks_reminder ON tasks (family_id, reminder_at);

-- ---------------------------------------------------------
-- 3) items: event_id / events FK を除去して再構築
-- ---------------------------------------------------------
CREATE TABLE items_wave52 (
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
    task_id INTEGER NULL,
    group_key TEXT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

INSERT INTO items_wave52 (
    id,family_id,name,memo,due_at,status,completion_mode,completed_by,completed_at,
    created_by,created_at,updated_at,task_id,group_key
)
SELECT
    id,family_id,name,memo,due_at,status,completion_mode,completed_by,completed_at,
    created_by,created_at,updated_at,task_id,group_key
FROM items;

DROP TABLE items;
ALTER TABLE items_wave52 RENAME TO items;

CREATE INDEX idx_items_family ON items (family_id);
CREATE INDEX idx_items_due ON items (family_id, due_at);
CREATE INDEX idx_items_status ON items (family_id, status);
CREATE INDEX idx_items_task ON items(task_id);

-- ---------------------------------------------------------
-- 4) shopping_items: event_id / events FK を除去して再構築
-- ---------------------------------------------------------
CREATE TABLE shopping_items_wave52 (
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
    task_id INTEGER NULL,
    url TEXT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

INSERT INTO shopping_items_wave52 (
    id,family_id,name,quantity,category,memo,due_date,status,completed_by,completed_at,
    created_by,created_at,updated_at,task_id,url
)
SELECT
    id,family_id,name,quantity,category,memo,due_date,status,completed_by,completed_at,
    created_by,created_at,updated_at,task_id,url
FROM shopping_items;

DROP TABLE shopping_items;
ALTER TABLE shopping_items_wave52 RENAME TO shopping_items;

CREATE INDEX idx_shopping_family ON shopping_items (family_id);
CREATE INDEX idx_shopping_due ON shopping_items (family_id, due_date);
CREATE INDEX idx_shopping_status ON shopping_items (family_id, status);
CREATE INDEX idx_shopping_task ON shopping_items(task_id);

-- ---------------------------------------------------------
-- 5) recurring_tasks: event_id / events FK を除去して再構築
-- ---------------------------------------------------------
CREATE TABLE recurring_tasks_wave52 (
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
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

INSERT INTO recurring_tasks_wave52 (
    id,family_id,title,description,recurrence_type,interval_value,weekday,month_day,
    week_number,start_date,end_date,completion_mode,active,created_by,created_at,updated_at
)
SELECT
    id,family_id,title,description,recurrence_type,interval_value,weekday,month_day,
    week_number,start_date,end_date,completion_mode,active,created_by,created_at,updated_at
FROM recurring_tasks;

DROP TABLE recurring_tasks;
ALTER TABLE recurring_tasks_wave52 RENAME TO recurring_tasks;

CREATE INDEX idx_recurring_family ON recurring_tasks (family_id);
CREATE INDEX idx_recurring_active ON recurring_tasks (family_id, active);

-- ---------------------------------------------------------
-- 6) messages を現行 task-only スキーマで復元
-- ---------------------------------------------------------
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    sender_id INTEGER NULL,
    target_member_id INTEGER NULL,
    text TEXT NOT NULL,
    converted_to_shopping_id INTEGER NULL,
    converted_to_task_id INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    reminder_at TEXT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (target_member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_to_shopping_id) REFERENCES shopping_items(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_to_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

INSERT INTO messages (
    id,family_id,sender_id,target_member_id,text,converted_to_shopping_id,
    converted_to_task_id,created_at,updated_at,status,reminder_at
)
SELECT
    id,family_id,sender_id,target_member_id,text,converted_to_shopping_id,
    converted_to_task_id,created_at,updated_at,status,reminder_at
FROM _wave52_messages;

CREATE INDEX idx_messages_family ON messages (family_id, created_at);
CREATE INDEX idx_messages_sender ON messages (sender_id);
CREATE INDEX idx_messages_target ON messages (target_member_id);
CREATE INDEX idx_messages_reminder ON messages (family_id, reminder_at);
CREATE INDEX idx_messages_status ON messages(family_id, status, created_at);

-- ---------------------------------------------------------
-- 7) FK子テーブルを復元
-- ---------------------------------------------------------
CREATE TABLE task_assignees (
    task_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, member_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO task_assignees SELECT task_id,member_id FROM _wave52_task_assignees;
CREATE INDEX idx_task_assignees_member ON task_assignees (member_id);

CREATE TABLE task_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO task_completion_history SELECT id,task_id,member_id,action,occurred_at FROM _wave52_task_completion_history;
CREATE INDEX idx_task_history_task ON task_completion_history (task_id, occurred_at);
CREATE INDEX idx_task_history_member ON task_completion_history (member_id);

CREATE TABLE item_assignees (
    item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    PRIMARY KEY (item_id, member_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO item_assignees SELECT item_id,member_id FROM _wave52_item_assignees;
CREATE INDEX idx_item_assignees_member ON item_assignees (member_id);

CREATE TABLE item_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO item_completion_history SELECT id,item_id,member_id,action,occurred_at FROM _wave52_item_completion_history;
CREATE INDEX idx_item_history_item ON item_completion_history (item_id, occurred_at);
CREATE INDEX idx_item_history_member ON item_completion_history (member_id);

CREATE TABLE shopping_assignees (
    shopping_item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    PRIMARY KEY (shopping_item_id, member_id),
    FOREIGN KEY (shopping_item_id) REFERENCES shopping_items(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO shopping_assignees SELECT shopping_item_id,member_id FROM _wave52_shopping_assignees;
CREATE INDEX idx_shopping_assignees_member ON shopping_assignees (member_id);

CREATE TABLE shopping_completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopping_item_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (shopping_item_id) REFERENCES shopping_items(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO shopping_completion_history SELECT id,shopping_item_id,member_id,action,occurred_at FROM _wave52_shopping_completion_history;
CREATE INDEX idx_shopping_history_item ON shopping_completion_history (shopping_item_id, occurred_at);
CREATE INDEX idx_shopping_history_member ON shopping_completion_history (member_id);

-- ---------------------------------------------------------
-- 8) 退避テーブル削除
-- ---------------------------------------------------------
DROP TABLE _wave52_messages;
DROP TABLE _wave52_task_assignees;
DROP TABLE _wave52_task_completion_history;
DROP TABLE _wave52_item_assignees;
DROP TABLE _wave52_item_completion_history;
DROP TABLE _wave52_shopping_assignees;
DROP TABLE _wave52_shopping_completion_history;

PRAGMA defer_foreign_keys = OFF;
