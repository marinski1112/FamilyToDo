#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do
  sqlite3 "$db" < "$migration"
done
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='family_quick_chores'")" = 1
sqlite3 "$db" "SELECT id, family_id, name, icon, sort_order, active, weekday_mask, created_by, created_at, updated_at FROM family_quick_chores LIMIT 1"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_logs') WHERE name='quick_chore_id'")" = 1
sqlite3 "$db" "SELECT quick_chore_id FROM family_logs LIMIT 1"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='family_log_import_batches'")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_log_import_batches') WHERE name IN ('status','processed_count','failed_at','completed_at','chunk_manifest_json')")" = 5
sqlite3 "$db" "SELECT status,processed_count,failed_at,completed_at,chunk_manifest_json FROM family_log_import_batches LIMIT 1"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_logs') WHERE name IN ('import_batch_id','import_source_key','import_source_text','import_source_page','import_external_id')")" = 5
echo 'migration smoke: ok'
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_family_log_templates'")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('family_logs') WHERE name='task_family_log_template_id'")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name IN ('visibility_scope','private_owner_id')")" = 2
sqlite3 "$db" "INSERT INTO families(family_code,name,created_at,updated_at) VALUES('W83','Wave83','2026-01-01','2026-01-01'); INSERT INTO members(family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,'w83','A','OWNER',1,'2026-01-01','2026-01-01'); INSERT INTO tasks(family_id,title,status,created_at,updated_at) VALUES(1,'existing','pending','2026-01-01','2026-01-01');"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM tasks WHERE visibility_scope='FAMILY' AND private_owner_id IS NULL")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='family_log_settings'")" = 1
test "$(sqlite3 "$db" "SELECT dflt_value FROM pragma_table_info('family_log_settings') WHERE name='show_adult_logs'")" = 1
echo 'wave92 settings migration smoke: ok'
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('google_home_authorization_codes','google_home_tokens','external_command_receipts')")" = 3
echo 'wave96 google home migration smoke: ok'

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('location_devices','member_location_latest','member_location_history')")" = 3
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('location_devices') WHERE name IN ('public_id','family_id','member_id','provider','secret_hash','enabled','sharing_enabled','revoked_at')")" = 8
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('location_devices') WHERE lower(name) IN ('secret','token','authorization','raw_payload','payload')")" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('member_location_latest') WHERE name IN ('family_id','member_id','device_id','provider','latitude','longitude','recorded_at','received_at')")" = 8
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM pragma_table_info('member_location_history') WHERE name IN ('family_id','member_id','device_id','provider','dedupe_key','latitude','longitude','recorded_at','received_at')")" = 9
sqlite3 "$db" "INSERT INTO location_devices(public_id,family_id,member_id,provider,secret_hash,enabled,sharing_enabled) VALUES('device-public-id-0001',1,1,'OWNTRACKS','0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',1,0);"
test "$(sqlite3 "$db" "SELECT sharing_enabled FROM location_devices WHERE public_id='device-public-id-0001'")" = 0
echo 'location persistence migration smoke: ok'
