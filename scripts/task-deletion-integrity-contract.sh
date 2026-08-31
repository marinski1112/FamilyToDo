#!/usr/bin/env bash
set -euo pipefail

db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done

# Legacy completion snapshots have no action column. Task-child archival must synthesize
# COMPLETED just like the standalone shopping/item archive helpers rather than selecting c.action.
grep -Fq "SELECT ?, 'shopping', c.shopping_item_id, c.member_id, 'COMPLETED', c.completed_at, 'shopping_legacy_completion'" src/lifecycle.ts
grep -Fq "SELECT ?, 'item', c.item_id, c.member_id, 'COMPLETED', c.completed_at, 'item_legacy_completion'" src/lifecycle.ts
if grep -Fq "c.member_id, c.action, c.completed_at" src/lifecycle.ts; then
  echo 'task-deletion-integrity-contract: legacy child archival must not read a nonexistent action column' >&2
  exit 1
fi

sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=OFF;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(86,'W86','Wave86','2026','2026');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(861,86,'a','A','OWNER',1,'2026','2026'),(862,86,'b','B','ADMIN',1,'2026','2026');
INSERT INTO tasks(id,family_id,title,status,task_kind,due_at,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
(861,86,'expired','pending','TASK','2026-08-26',861,'2026','2026','FAMILY',NULL),(862,86,'done','completed','TASK','2026-08-25',861,'2026','2026','FAMILY',NULL),(863,86,'no date','pending','TASK',NULL,861,'2026','2026','FAMILY',NULL),(864,86,'event','pending','EVENT','2026-08-25',861,'2026','2026','FAMILY',NULL),(865,86,'B private','pending','TASK','2026-08-25',862,'2026','2026','PRIVATE',862);
INSERT INTO items(id,family_id,name,status,task_id,created_by,created_at,updated_at) VALUES(861,86,'child','pending',861,861,'2026','2026');
INSERT INTO shopping_items(id,family_id,name,status,task_id,created_by,created_at,updated_at) VALUES(861,86,'shop','pending',861,861,'2026','2026');
INSERT INTO activity_logs(id,family_id,member_id,action,target_type,target_id,occurred_at) VALUES(861,86,861,'x','task',861,'2026'),(862,86,861,'x','item',861,'2026'),(863,86,861,'x','shopping',861,'2026');
INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(861,861,'COMPLETED','2026');
SQL

expired="$(sqlite3 "$db" "SELECT group_concat(id) FROM tasks WHERE family_id=86 AND status='pending' AND (task_kind IS NULL OR lower(task_kind)='task') AND COALESCE(end_at,due_at,start_at) IS NOT NULL AND date(COALESCE(end_at,due_at,start_at))<date('2026-08-27') AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=861));")"
test "$expired" = 861

sqlite3 "$db" "DELETE FROM activity_logs WHERE family_id=86 AND ((target_type='task' AND target_id=861) OR (target_type='item' AND target_id IN (SELECT id FROM items WHERE family_id=86 AND task_id=861)) OR (target_type='shopping' AND target_id IN (SELECT id FROM shopping_items WHERE family_id=86 AND task_id=861))); UPDATE tasks SET visibility_scope='PRIVATE',private_owner_id=861 WHERE id=861; DELETE FROM items WHERE task_id=861; DELETE FROM shopping_items WHERE task_id=861; DELETE FROM tasks WHERE id=861;"

test "$(sqlite3 "$db" 'SELECT count(*) FROM activity_logs')" = 0
test "$(sqlite3 "$db" 'SELECT count(*) FROM task_completion_history')" = 1

echo 'task-deletion-integrity-contract: expired filtering and deletion integrity ok'
