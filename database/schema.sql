-- Family TODO LINE static deployment schema
-- Derived from installer2-1.php and installer3.php.
-- Import after installer1.php has created app/config.php and the base users table.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS families (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_families_family_code (family_code)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id BIGINT UNSIGNED NOT NULL,

    line_user_id VARCHAR(128) NULL,

    name VARCHAR(255) NOT NULL,

    member_type ENUM(
        'ADULT',
        'CHILD'
    ) NOT NULL DEFAULT 'ADULT',

    role ENUM(
        'OWNER',
        'MEMBER',
        'CHILD'
    ) NOT NULL DEFAULT 'MEMBER',

    icon VARCHAR(32) NULL,

    notification_enabled TINYINT(1)
        NOT NULL DEFAULT 1,

    active TINYINT(1)
        NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_members_family_id (
        family_id
    ),

    KEY idx_members_line_user_id (
        line_user_id
    ),

    KEY idx_members_active (
        family_id,
        active
    ),

    CONSTRAINT fk_members_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    title VARCHAR(255) NOT NULL,

    start_at DATETIME NULL,
    end_at DATETIME NULL,

    location VARCHAR(500) NULL,

    memo TEXT NULL,

    created_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_events_family_id (
        family_id
    ),

    KEY idx_events_start_at (
        family_id,
        start_at
    ),

    KEY idx_events_created_by (
        created_by
    ),

    CONSTRAINT fk_events_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_events_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_members (
    event_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        event_id,
        member_id
    ),

    KEY idx_event_members_member (
        member_id
    ),

    CONSTRAINT fk_event_members_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_event_members_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    event_id BIGINT UNSIGNED NULL,

    title VARCHAR(500) NOT NULL,

    description TEXT NULL,

    due_at DATETIME NULL,

    status ENUM(
        'pending',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',

    completion_mode ENUM(
        'ANY',
        'ALL'
    ) NOT NULL DEFAULT 'ANY',

    completed_by BIGINT UNSIGNED NULL,

    completed_at DATETIME NULL,

    recurrence_rule JSON NULL,

    source_template_id BIGINT UNSIGNED NULL,

    created_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_tasks_family (
        family_id
    ),

    KEY idx_tasks_due (
        family_id,
        due_at
    ),

    KEY idx_tasks_status (
        family_id,
        status
    ),

    KEY idx_tasks_event (
        event_id
    ),

    KEY idx_tasks_completed_by (
        completed_by
    ),

    CONSTRAINT fk_tasks_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_tasks_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_tasks_completed_by
        FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_tasks_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        task_id,
        member_id
    ),

    KEY idx_task_assignees_member (
        member_id
    ),

    CONSTRAINT fk_task_assignees_task
        FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_task_assignees_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_completion_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    task_id BIGINT UNSIGNED NOT NULL,

    member_id BIGINT UNSIGNED NOT NULL,

    action ENUM(
        'COMPLETED',
        'UNCOMPLETED'
    ) NOT NULL,

    occurred_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_task_history_task (
        task_id,
        occurred_at
    ),

    KEY idx_task_history_member (
        member_id
    ),

    CONSTRAINT fk_task_history_task
        FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_task_history_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    event_id BIGINT UNSIGNED NULL,

    name VARCHAR(500) NOT NULL,

    memo TEXT NULL,

    due_at DATETIME NULL,

    status ENUM(
        'pending',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',

    completion_mode ENUM(
        'ANY',
        'ALL'
    ) NOT NULL DEFAULT 'ANY',

    completed_by BIGINT UNSIGNED NULL,

    completed_at DATETIME NULL,

    created_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_items_family (
        family_id
    ),

    KEY idx_items_due (
        family_id,
        due_at
    ),

    KEY idx_items_event (
        event_id
    ),

    KEY idx_items_status (
        family_id,
        status
    ),

    CONSTRAINT fk_items_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_items_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_items_completed_by
        FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_items_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_assignees (
    item_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        item_id,
        member_id
    ),

    KEY idx_item_assignees_member (
        member_id
    ),

    CONSTRAINT fk_item_assignees_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_item_assignees_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_completion_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    item_id BIGINT UNSIGNED NOT NULL,

    member_id BIGINT UNSIGNED NOT NULL,

    action ENUM(
        'COMPLETED',
        'UNCOMPLETED'
    ) NOT NULL,

    occurred_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_item_history_item (
        item_id,
        occurred_at
    ),

    KEY idx_item_history_member (
        member_id
    ),

    CONSTRAINT fk_item_history_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_item_history_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shopping_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    event_id BIGINT UNSIGNED NULL,

    name VARCHAR(500) NOT NULL,

    quantity VARCHAR(100) NULL,

    category VARCHAR(100) NULL,

    memo TEXT NULL,

    due_date DATE NULL,

    status ENUM(
        'pending',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',

    completed_by BIGINT UNSIGNED NULL,

    completed_at DATETIME NULL,

    created_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_shopping_family (
        family_id
    ),

    KEY idx_shopping_due (
        family_id,
        due_date
    ),

    KEY idx_shopping_status (
        family_id,
        status
    ),

    KEY idx_shopping_event (
        event_id
    ),

    CONSTRAINT fk_shopping_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shopping_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_shopping_completed_by
        FOREIGN KEY (completed_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_shopping_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shopping_assignees (
    shopping_item_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        shopping_item_id,
        member_id
    ),

    KEY idx_shopping_assignees_member (
        member_id
    ),

    CONSTRAINT fk_shopping_assignees_item
        FOREIGN KEY (shopping_item_id)
        REFERENCES shopping_items(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shopping_assignees_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shopping_completion_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    shopping_item_id BIGINT UNSIGNED NOT NULL,

    member_id BIGINT UNSIGNED NOT NULL,

    action ENUM(
        'COMPLETED',
        'UNCOMPLETED'
    ) NOT NULL,

    occurred_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_shopping_history_item (
        shopping_item_id,
        occurred_at
    ),

    KEY idx_shopping_history_member (
        member_id
    ),

    CONSTRAINT fk_shopping_history_item
        FOREIGN KEY (shopping_item_id)
        REFERENCES shopping_items(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shopping_history_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    event_id BIGINT UNSIGNED NULL,

    sender_id BIGINT UNSIGNED NULL,

    target_member_id BIGINT UNSIGNED NULL,

    text TEXT NOT NULL,

    converted_to_shopping_id
        BIGINT UNSIGNED NULL,

    converted_to_task_id
        BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_messages_family (
        family_id,
        created_at
    ),

    KEY idx_messages_event (
        event_id
    ),

    KEY idx_messages_sender (
        sender_id
    ),

    KEY idx_messages_target (
        target_member_id
    ),

    CONSTRAINT fk_messages_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_messages_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_messages_target
        FOREIGN KEY (target_member_id)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_messages_shopping
        FOREIGN KEY (converted_to_shopping_id)
        REFERENCES shopping_items(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_messages_task
        FOREIGN KEY (converted_to_task_id)
        REFERENCES tasks(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recurring_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    title VARCHAR(500) NOT NULL,

    description TEXT NULL,

    recurrence_type ENUM(
        'DAILY',
        'INTERVAL_DAYS',
        'WEEKLY',
        'INTERVAL_WEEKS',
        'MONTHLY_DAY',
        'MONTHLY_WEEKDAY'
    ) NOT NULL,

    interval_value INT UNSIGNED NULL,

    weekday TINYINT UNSIGNED NULL,

    month_day TINYINT UNSIGNED NULL,

    week_number TINYINT UNSIGNED NULL,

    start_date DATE NOT NULL,

    end_date DATE NULL,

    event_id BIGINT UNSIGNED NULL,

    completion_mode ENUM(
        'ANY',
        'ALL'
    ) NOT NULL DEFAULT 'ANY',

    active TINYINT(1)
        NOT NULL DEFAULT 1,

    created_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_recurring_family (
        family_id
    ),

    KEY idx_recurring_active (
        family_id,
        active
    ),

    CONSTRAINT fk_recurring_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_recurring_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_recurring_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    member_id BIGINT UNSIGNED NOT NULL,

    type VARCHAR(50) NOT NULL,

    target_type VARCHAR(50) NULL,

    target_id BIGINT UNSIGNED NULL,

    notify_at DATETIME NOT NULL,

    sent_at DATETIME NULL,

    status ENUM(
        'pending',
        'sent',
        'failed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',

    message TEXT NULL,

    created_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_notifications_member (
        member_id,
        notify_at
    ),

    KEY idx_notifications_pending (
        status,
        notify_at
    ),

    KEY idx_notifications_family (
        family_id
    ),

    CONSTRAINT fk_notifications_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_notifications_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_settings (
    family_id BIGINT UNSIGNED NOT NULL,

    setting_key VARCHAR(100) NOT NULL,

    setting_value JSON NULL,

    updated_at DATETIME NOT NULL,

    PRIMARY KEY (
        family_id,
        setting_key
    ),

    CONSTRAINT fk_family_settings_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    member_id BIGINT UNSIGNED NULL,

    action VARCHAR(100) NOT NULL,

    target_type VARCHAR(50) NULL,

    target_id BIGINT UNSIGNED NULL,

    metadata JSON NULL,

    occurred_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    KEY idx_activity_family (
        family_id,
        occurred_at
    ),

    KEY idx_activity_member (
        member_id,
        occurred_at
    ),

    KEY idx_activity_target (
        target_type,
        target_id
    ),

    CONSTRAINT fk_activity_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_activity_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_invitations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    family_id BIGINT UNSIGNED NOT NULL,

    token_hash CHAR(64) NOT NULL,

    created_by BIGINT UNSIGNED NULL,

    expires_at DATETIME NULL,

    used_at DATETIME NULL,

    used_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_family_invitation_token (
        token_hash
    ),

    KEY idx_family_invitation_family (
        family_id
    ),

    KEY idx_family_invitation_expires (
        expires_at
    ),

    CONSTRAINT fk_family_invitation_family
        FOREIGN KEY (family_id)
        REFERENCES families(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_family_invitation_created_by
        FOREIGN KEY (created_by)
        REFERENCES members(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_family_invitation_used_by
        FOREIGN KEY (used_by)
        REFERENCES members(id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_completions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    task_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL DEFAULT 'completed',
    completed_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_task_completion_task (task_id),
    KEY idx_task_completion_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_completions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL DEFAULT 'completed',
    completed_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_item_completion_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_completions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    shopping_item_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL DEFAULT 'completed',
    completed_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_shopping_completion_item (
        shopping_item_id
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recurrence_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id BIGINT UNSIGNED NOT NULL,
    task_id BIGINT UNSIGNED NULL,
    name VARCHAR(255) NOT NULL,
    recurrence_type VARCHAR(30) NOT NULL,
    interval_value INT NOT NULL DEFAULT 1,
    weekday TINYINT NULL,
    monthday TINYINT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_recurrence_family (family_id),
    KEY idx_recurrence_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    before_day TINYINT(1) NOT NULL DEFAULT 1,
    morning TINYINT(1) NOT NULL DEFAULT 1,
    one_hour_before TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_member (
        family_id,
        member_id
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
