#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"
trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done

sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=OFF;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'A','A','2026-08-01','2026-08-01'),(2,'B','B','2026-08-01','2026-08-01');
INSERT INTO members(id,family_id,name,role,active,created_at,updated_at) VALUES(1,1,'記録者A','OWNER',1,'2026-08-01','2026-08-01'),(2,2,'記録者B','OWNER',1,'2026-08-01','2026-08-01');
INSERT INTO family_quick_chores(id,family_id,name,icon,sort_order,active,created_by,created_at,updated_at) VALUES
 (10,1,'表示中','🧹',1,1,1,'2026-08-01','2026-08-01'),
 (11,1,'非表示','🧺',2,0,1,'2026-08-01','2026-08-01'),
 (20,2,'別家族','⚠️',1,1,2,'2026-08-01','2026-08-01');
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,value_text,created_by,created_at,updated_at,deleted_at,quick_chore_id) VALUES
 (1,1,NULL,'HOUSEWORK',datetime('now','+9 hours'),'旧名称',1,'2026-08-01','2026-08-01',NULL,10),
 (2,1,NULL,'HOUSEWORK',datetime('now','+9 hours'),'非表示',1,'2026-08-01','2026-08-01',NULL,11),
 (3,1,NULL,'HOUSEWORK',datetime('now','+9 hours'),'削除対象',1,'2026-08-01','2026-08-01','2026-08-02',10),
 (4,1,NULL,'HOUSEWORK',datetime('now','+9 hours'),'手動',1,'2026-08-01','2026-08-01',NULL,NULL),
 (5,1,NULL,'HOUSEWORK',datetime('now','+9 hours'),'不正',1,'2026-08-01','2026-08-01',NULL,20);
SQL

# Active, inactive, and legacy-unlinked HOUSEWORK remain; soft-deleted rows do not.
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=1 AND log_type='HOUSEWORK' AND deleted_at IS NULL AND date(occurred_at)>=date('now','+9 hours','-6 days')")" = 4
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs l JOIN family_quick_chores q ON q.id=l.quick_chore_id AND q.family_id=l.family_id WHERE l.family_id=1 AND l.deleted_at IS NULL AND q.active=0")" = 1
# The cross-family reference is diagnosed; inactive same-family references are valid.
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs l WHERE l.family_id=1 AND l.quick_chore_id IS NOT NULL AND (l.log_type<>'HOUSEWORK' OR NOT EXISTS(SELECT 1 FROM family_quick_chores q WHERE q.id=l.quick_chore_id AND q.family_id=l.family_id))")" = 1
# Provenance lifecycle: retain for HOUSEWORK, clear on another type, and do not infer manual HOUSEWORK.
sqlite3 "$db" "UPDATE family_logs SET quick_chore_id=CASE WHEN 'HOUSEWORK'='HOUSEWORK' THEN quick_chore_id ELSE NULL END WHERE id=1"
test "$(sqlite3 "$db" 'SELECT quick_chore_id FROM family_logs WHERE id=1')" = 10
sqlite3 "$db" "UPDATE family_logs SET log_type='MEMO',quick_chore_id=CASE WHEN 'MEMO'='HOUSEWORK' THEN quick_chore_id ELSE NULL END WHERE id=1"
test "$(sqlite3 "$db" 'SELECT quick_chore_id IS NULL FROM family_logs WHERE id=1')" = 1
test "$(sqlite3 "$db" 'SELECT quick_chore_id IS NULL FROM family_logs WHERE id=4')" = 1

echo 'wave81 smoke: ok'
