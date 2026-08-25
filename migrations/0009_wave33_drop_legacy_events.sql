-- Family TODO LINE Wave33
-- イベント概念の完全廃止。Wave31で関連データをタスクへ移行済み、
-- Wave32でアプリケーション参照を除去済みのため、旧イベントテーブルを物理削除する。
-- 子テーブルの event_id は全て Wave31 で NULL 化されていることを前提とする。

-- 監査・復旧用途として残っていたイベント参加者を先に削除。
DELETE FROM event_members;

-- 旧イベント参照を残さない。
UPDATE tasks SET event_id=NULL WHERE event_id IS NOT NULL;
UPDATE items SET event_id=NULL WHERE event_id IS NOT NULL;
UPDATE shopping_items SET event_id=NULL WHERE event_id IS NOT NULL;
UPDATE messages SET event_id=NULL WHERE event_id IS NOT NULL;
UPDATE recurring_tasks SET event_id=NULL WHERE event_id IS NOT NULL;

-- 旧イベント関連インデックスを削除。
DROP INDEX IF EXISTS idx_event_members_member;
DROP INDEX IF EXISTS idx_events_family_id;
DROP INDEX IF EXISTS idx_events_start_at;
DROP INDEX IF EXISTS idx_events_created_by;
DROP INDEX IF EXISTS idx_tasks_event;
DROP INDEX IF EXISTS idx_items_event;
DROP INDEX IF EXISTS idx_shopping_event;
DROP INDEX IF EXISTS idx_messages_event;

-- イベント本体を物理削除。
DROP TABLE IF EXISTS event_members;
DROP TABLE IF EXISTS events;
