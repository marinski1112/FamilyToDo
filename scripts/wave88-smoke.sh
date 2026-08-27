#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
sqlite3 "$db" <<'SQL'
PRAGMA foreign_keys=ON;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'W88A','A','x','x'),(2,'W88B','B','x','x');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'a','owner','OWNER',1,'x','x'),(2,2,'b','other','OWNER',1,'x','x');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_by,created_at,updated_at) VALUES(10,1,'baby','BABY',1,1,'x','x'),(20,2,'cross','BABY',1,2,'x','x');
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,value_text,created_by,created_at,updated_at) VALUES(100,1,10,'MEMO','2026-03-04 01:00:00','normal',1,'x','x');
INSERT INTO family_log_import_batches(id,family_id,subject_id,source,source_hash,record_count,imported_count,skipped_count,error_count,created_by,created_at) VALUES(50,1,10,'piyolog','filehash',2,1,1,0,1,'2026-03-04 03:00:00');
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,amount,unit,created_by,created_at,updated_at,import_batch_id,import_source_key,import_source_text,import_source_page) VALUES(101,1,10,'MILK','2026-03-04 02:05:00',60,'ml',1,'2026-03-04 03:00:00','2026-03-04 03:00:00',50,'key1','ミルク 60ml',1);
SQL
# Record idempotency and soft-delete re-import semantics.
if sqlite3 "$db" "INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,import_batch_id,import_source_key) VALUES(1,10,'MILK','2026-03-04',1,'x','x',50,'key1')" 2>/dev/null; then exit 1; fi
sqlite3 "$db" "UPDATE family_logs SET deleted_at='rollback',updated_at='rollback' WHERE id=101; INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,import_batch_id,import_source_key) VALUES(1,10,'MILK','2026-03-04',1,'x','x',50,'key1');"
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_logs WHERE import_source_key="key1"')" = 2
# Cross-family subjects and batches are detectable; application validation rejects them.
if sqlite3 "$db" "INSERT INTO family_log_import_batches(family_id,subject_id,source,source_hash,created_by,created_at) VALUES(1,20,'x','x',1,'x')" 2>/dev/null; then :; fi
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_log_import_batches b JOIN family_log_subjects s ON s.id=b.subject_id WHERE b.family_id<>s.family_id')" = 1
# Rollback excludes edited import rows and leaves normal/PRIVATE task subsystems untouched.
sqlite3 "$db" "UPDATE family_logs SET updated_at='edited' WHERE id=(SELECT MAX(id) FROM family_logs WHERE import_source_key='key1'); UPDATE family_logs SET deleted_at='rb',updated_at='rb' WHERE import_batch_id=50 AND deleted_at IS NULL AND updated_at=created_at; UPDATE family_log_import_batches SET rolled_back_at='rb',rolled_back_by=1 WHERE id=50 AND rolled_back_at IS NULL;"
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_logs WHERE id=100 AND deleted_at IS NULL')" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE import_source_key='key1' AND deleted_at IS NULL AND updated_at='edited'")" = 1
sqlite3 "$db" "UPDATE family_log_import_batches SET rolled_back_at='again' WHERE id=50 AND rolled_back_at IS NULL"
test "$(sqlite3 "$db" 'SELECT rolled_back_at FROM family_log_import_batches WHERE id=50')" = rb
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('events','event_members')")" = 0
echo 'wave88 smoke: ok'
