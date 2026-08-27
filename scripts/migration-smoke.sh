#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do
  sqlite3 "$db" < "$migration"
done
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='family_quick_chores'")" = 1
sqlite3 "$db" "SELECT id, family_id, name, icon, sort_order, active, created_by, created_at, updated_at FROM family_quick_chores LIMIT 1"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_logs') WHERE name='quick_chore_id'")" = 1
sqlite3 "$db" "SELECT quick_chore_id FROM family_logs LIMIT 1"
echo 'migration smoke: ok'
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_family_log_templates'")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_logs') WHERE name='task_family_log_template_id'")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name IN ('visibility_scope','private_owner_id')")" = 2
sqlite3 "$db" "INSERT INTO families(family_code,name,created_at,updated_at) VALUES('W83','Wave83','2026-01-01','2026-01-01'); INSERT INTO members(family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,'w83','A','OWNER',1,'2026-01-01','2026-01-01'); INSERT INTO tasks(family_id,title,status,created_at,updated_at) VALUES(1,'existing','pending','2026-01-01','2026-01-01');"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM tasks WHERE visibility_scope='FAMILY' AND private_owner_id IS NULL")" = 1
