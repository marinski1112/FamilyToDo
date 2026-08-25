-- Family TODO LINE Wave31
-- イベント（予定）をタスクへ一本化するためのデータ移行。
-- events / event_members のテーブル自体は、このWaveでは削除しない。
-- 既存データを保全したままアプリ側からイベント概念を切り離す。

-- 1) 既存イベントに紐づくタスクが無い場合、そのイベントをタスクへ昇格する。
INSERT INTO tasks (
    family_id, event_id, title, description, due_at, status, completion_mode,
    created_by, created_at, updated_at, start_at, end_at, location,
    all_day, calendar_visible, calendar_color, task_kind, sort_order
)
SELECT
    e.family_id, e.id, e.title, e.memo,
    COALESCE(e.start_at, e.end_at), 'pending', 'ANY',
    e.created_by, e.created_at, e.updated_at, e.start_at, e.end_at, e.location,
    CASE
      WHEN e.start_at IS NOT NULL AND substr(e.start_at,12,5) <> '00:00' THEN 0
      ELSE 1
    END,
    1, '#7c3aed', 'TASK', 0
FROM events e
WHERE NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.event_id = e.id AND t.family_id = e.family_id
);

-- 2) 既存タスクにイベントの日時・場所・説明を取り込む。
-- タスク側に既に入力されている値は優先する。
UPDATE tasks
SET
    title = CASE WHEN trim(COALESCE(title,''))='' THEN (SELECT e.title FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id) ELSE title END,
    description = CASE WHEN trim(COALESCE(description,''))='' THEN (SELECT e.memo FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id) ELSE description END,
    start_at = COALESCE(start_at,(SELECT e.start_at FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id)),
    end_at = COALESCE(end_at,(SELECT e.end_at FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id)),
    location = COALESCE(NULLIF(location,''),(SELECT e.location FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id)),
    due_at = COALESCE(due_at,(SELECT e.start_at FROM events e WHERE e.id=tasks.event_id AND e.family_id=tasks.family_id))
WHERE event_id IS NOT NULL;

-- 3) イベントに紐づいていた子データを、対応するタスクへ移す。
UPDATE shopping_items
SET task_id = (
    SELECT t.id FROM tasks t
    WHERE t.event_id = shopping_items.event_id
      AND t.family_id = shopping_items.family_id
    ORDER BY t.id LIMIT 1
)
WHERE event_id IS NOT NULL
  AND (task_id IS NULL OR task_id = 0)
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.event_id = shopping_items.event_id
      AND t.family_id = shopping_items.family_id
  );

UPDATE items
SET task_id = (
    SELECT t.id FROM tasks t
    WHERE t.event_id = items.event_id
      AND t.family_id = items.family_id
    ORDER BY t.id LIMIT 1
)
WHERE event_id IS NOT NULL
  AND (task_id IS NULL OR task_id = 0)
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.event_id = items.event_id
      AND t.family_id = items.family_id
  );

UPDATE messages
SET converted_to_task_id = (
    SELECT t.id FROM tasks t
    WHERE t.event_id = messages.event_id
      AND t.family_id = messages.family_id
    ORDER BY t.id LIMIT 1
)
WHERE event_id IS NOT NULL
  AND (converted_to_task_id IS NULL OR converted_to_task_id = 0)
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.event_id = messages.event_id
      AND t.family_id = messages.family_id
  );

-- 4) アプリケーションからは event_id を参照しない状態にする。
-- events テーブル自体は監査・復旧用に残す。
UPDATE tasks SET event_id = NULL WHERE event_id IS NOT NULL;
UPDATE shopping_items SET event_id = NULL WHERE event_id IS NOT NULL;
UPDATE items SET event_id = NULL WHERE event_id IS NOT NULL;
UPDATE messages SET event_id = NULL WHERE event_id IS NOT NULL;
