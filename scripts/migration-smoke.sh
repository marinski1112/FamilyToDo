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
