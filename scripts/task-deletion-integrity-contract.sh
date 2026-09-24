#!/usr/bin/env bash
set -euo pipefail

db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done

# Goods retain their own lifecycle helpers for explicit goods deletion, but task deletion
# must no longer call those helpers or remove goods/history as task children.
grep -Fq "SELECT ?, 'shopping', shopping_item_id, member_id, 'COMPLETED', completed_at, 'shopping_legacy_completion'" src/lifecycle.ts
grep -Fq "SELECT ?, 'item', item_id, member_id, 'COMPLETED', completed_at, 'item_legacy_completion'" src/lifecycle.ts
if grep -Eq "archive(Shopping|Item)CompletionStatements" src/task-delete.ts src/task-api.ts; then
  echo 'task-deletion-integrity-contract: task deletion must not archive/delete independent goods completion state' >&2
  exit 1
fi
if grep -Eq "DELETE FROM (items|shopping_items)" src/task-delete.ts src/task-api.ts; then
  echo 'task-deletion-integrity-contract: task deletion must not delete independent goods' >&2
  exit 1
fi

sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=OFF;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(86,'W86','Wave86','2026','2026');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(861,86,'a','A','OWNER',1,'2026','2026'),(862,86,'b','B','ADMIN',1,'2026','2026');
INSERT INTO tasks(id,family_id,title,status,task_kind,due_at,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
(861,86,'expired','pending','TASK','2026-08-26',861,'2026','2026','FAMILY',NULL),(862,86,'done','completed','TASK','2026-08-25',861,'2026','2026','FAMILY',NULL),(863,86,'no date','pending','TASK',NULL,861,'2026','2026','FAMILY',NULL),(864,86,'event','pending','EVENT','2026-08-25',861,'2026','2026','FAMILY',NULL),(865,86,'B private','pending','TASK','2026-08-25',862,'2026','2026','PRIVATE',862);
INSERT INTO items(id,family_id,name,status,created_by,created_at,updated_at,visibility_scope,private_owner_id,completed_by,completed_at) VALUES(861,86,'legacy child','completed',861,'2026','2026','FAMILY',NULL,861,'2026-08-20 08:00:00');
INSERT INTO shopping_items(id,family_id,name,status,created_by,created_at,updated_at,visibility_scope,private_owner_id,completed_by,completed_at) VALUES(861,86,'legacy shop','completed',861,'2026','2026','FAMILY',NULL,861,'2026-08-20 08:00:00');
INSERT INTO item_completions(item_id,member_id,action,completed_at) VALUES(861,861,'completed','2026-08-20 08:00:00');
INSERT INTO shopping_completions(shopping_item_id,member_id,action,completed_at) VALUES(861,861,'completed','2026-08-20 08:00:00');
INSERT INTO item_completion_history(item_id,member_id,action,occurred_at) VALUES(861,861,'COMPLETED','2026-08-20 08:00:00');
INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(861,861,'COMPLETED','2026-08-20 08:00:00');
INSERT INTO activity_logs(id,family_id,member_id,action,target_type,target_id,occurred_at) VALUES(861,86,861,'x','task',861,'2026'),(862,86,861,'x','item',861,'2026'),(863,86,861,'x','shopping',861,'2026');
INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(861,861,'COMPLETED','2026');
SQL

expired="$(sqlite3 "$db" "SELECT group_concat(id) FROM tasks WHERE family_id=86 AND status='pending' AND (task_kind IS NULL OR lower(task_kind)='task') AND COALESCE(end_at,due_at,start_at) IS NOT NULL AND date(COALESCE(end_at,due_at,start_at))<date('2026-08-27') AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=861));")"
test "$expired" = 861

# Emulate the authoritative task-row removal after task-specific history is archived.
# The cleanup migration removes task_id from Goods; deleting the Task still leaves
# independent Goods and their history/activity untouched.
sqlite3 "$db" "DELETE FROM tasks WHERE id=861;"

test "$(sqlite3 "$db" 'SELECT count(*) FROM items WHERE id=861')" = 1
test "$(sqlite3 "$db" 'SELECT count(*) FROM shopping_items WHERE id=861')" = 1
test "$(sqlite3 "$db" 'SELECT count(*) FROM item_completions WHERE item_id=861')" = 1
test "$(sqlite3 "$db" 'SELECT count(*) FROM shopping_completions WHERE shopping_item_id=861')" = 1
test "$(sqlite3 "$db" 'SELECT count(*) FROM item_completion_history WHERE item_id=861')" = 1
test "$(sqlite3 "$db" 'SELECT count(*) FROM shopping_completion_history WHERE shopping_item_id=861')" = 1
test "$(sqlite3 "$db" "SELECT count(*) FROM activity_logs WHERE target_type IN ('item','shopping') AND target_id=861")" = 2

echo 'task-deletion-integrity-contract: expired filtering and independent goods/history retention ok'