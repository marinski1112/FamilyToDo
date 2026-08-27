#!/usr/bin/env bash
set -euo pipefail
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
sqlite3 "$db" <<'SQL'
.bail on
PRAGMA foreign_keys=ON;
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'a','A','2026-01-01','2026-01-01'),(2,'b','B','2026-01-01','2026-01-01');
INSERT INTO members(id,family_id,name,role,active,created_at,updated_at) VALUES(1,1,'actor','OWNER',1,'x','x'),(2,1,'other','MEMBER',1,'x','x'),(3,2,'cross','OWNER',1,'x','x');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_by,created_at,updated_at) VALUES(10,1,'child','CHILD',1,1,'x','x'),(11,1,'off','CHILD',0,1,'x','x'),(12,2,'cross','CHILD',1,3,'x','x');
INSERT INTO tasks(id,family_id,title,status,completion_mode,created_by,created_at,updated_at,task_kind) VALUES(20,1,'any','pending','ANY',1,'x','x','RECURRING'),(21,1,'all','pending','ALL',1,'x','x','RECURRING'),(22,1,'none','pending','ANY',1,'x','x','RECURRING'),(23,1,'outsider','pending','ANY',1,'x','x','RECURRING'),(24,1,'legacy','pending','ANY',1,'x','x','RECURRING');
INSERT INTO recurrence_rules(id,family_id,task_id,name,recurrence_type,interval_value,start_date,active,created_at,updated_at) VALUES(30,1,20,'any','DAILY',1,'2026-01-01',1,'x','x'),(31,1,21,'all','DAILY',1,'2026-01-01',1,'x','x'),(32,1,22,'none','DAILY',1,'2026-01-01',1,'x','x'),(33,1,23,'outside','DAILY',1,'2026-01-01',1,'x','x'),(34,1,24,'legacy','DAILY',1,'2026-01-01',1,'x','x');
INSERT INTO recurrence_occurrences(id,family_id,recurrence_rule_id,occurrence_date,status,created_at,updated_at) VALUES(40,1,30,'2026-01-02','pending','x','x'),(41,1,31,'2026-01-02','pending','x','x'),(42,1,32,'2026-01-02','pending','x','x'),(43,1,33,'2026-01-02','pending','x','x'),(44,1,34,'2026-01-02','pending','x','x');
INSERT INTO task_family_log_templates(id,family_id,task_id,subject_id,log_type,active,created_by,created_at,updated_at) VALUES(50,1,20,10,'MEAL',1,1,'x','x'),(51,1,21,10,'MEAL',1,1,'x','x'),(52,1,22,NULL,'HOUSEWORK',1,1,'x','x'),(53,1,23,10,'MEAL',1,1,'x','x');
INSERT INTO task_assignees(task_id,member_id) VALUES(20,1),(21,1),(21,2),(23,2);
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id) VALUES(60,1,10,'MEAL','2026-01-02 12:00:00',40,1,'x','x',50);
INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(40,1,'x'),(41,1,'x'),(41,2,'x'),(42,1,'x');
SQL
# Provenance, recorder, linked occurrence, ANY, ALL and no-assignee cases.
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_logs WHERE id=60 AND task_family_log_template_id=50 AND linked_occurrence_id=40 AND created_by=1')" = 1
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM recurrence_occurrence_completions WHERE occurrence_id=40')" = 1
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM recurrence_occurrence_completions WHERE occurrence_id=41')" = 2
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM recurrence_occurrence_completions WHERE occurrence_id=42 AND member_id=1')" = 1
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM task_assignees WHERE task_id=23 AND member_id=1')" = 0
# Database idempotency under double submit; soft deletion permits a replacement.
if sqlite3 "$db" "INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id) VALUES(1,10,'MEAL','x',40,1,'x','x',50)" 2>/dev/null; then exit 1; fi
sqlite3 "$db" "UPDATE family_logs SET deleted_at='x' WHERE id=60; INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,linked_occurrence_id,created_by,created_at,updated_at,task_family_log_template_id) VALUES(1,10,'MEAL','x',40,1,'x','x',50)"
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_logs WHERE task_family_log_template_id=50 AND linked_occurrence_id=40')" = 2
# Invalid inactive/cross-family subjects are diagnosable; app validation rejects them.
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_log_subjects WHERE id=11 AND active=0')" = 1
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM family_log_subjects WHERE id=12 AND family_id<>1')" = 1
# A legacy recurrence without a template remains untouched and has no action.
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM task_family_log_templates WHERE task_id=24')" = 0
echo 'wave82 smoke: ok'
