#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs');
const app=fs.readFileSync('src/app.ts','utf8'),css=fs.readFileSync('public/assets/family.css','utf8');
for(const token of ["LIMIT 51 OFFSET ?","l.deleted_at IS NULL","GROUP BY date(l.occurred_at),l.log_type,l.detail_code","ROW_NUMBER() OVER","duration_minutes IS NULL","'VACCINE'","timelineType","adultSubjects","この期間の記録はありません","date(l.occurred_at)"]) if(!app.includes(token))throw new Error(`missing ${token}`);
if(app.includes('LIMIT 2500'))throw new Error('raw bulk fetch regression');
for(const token of ['family-log-bars','polyline','family-log-dashboard-grid'])if(!css.includes(token))throw new Error(`missing ${token}`);
JS
db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
sqlite3 "$db" <<'SQL'
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(91,'W91','Wave91','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(911,91,'w91','Adult','OWNER',1,'2026-08-27','2026-08-27');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_at,updated_at) VALUES(1,91,'Baby A','BABY',1,'2026-08-27','2026-08-27'),(2,91,'Baby B','BABY',1,'2026-08-27','2026-08-27'),(3,91,'Adult A','ADULT',1,'2026-08-27','2026-08-27'),(4,91,'Adult B','ADULT',1,'2026-08-27','2026-08-27');
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2500)
INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,created_by,created_at,updated_at,deleted_at)
SELECT 91,CASE WHEN x%4=0 THEN 2 WHEN x%4=1 THEN 3 WHEN x%4=2 THEN 4 ELSE 1 END,CASE x%10 WHEN 0 THEN 'MILK' WHEN 1 THEN 'SLEEP' WHEN 2 THEN 'DIAPER' WHEN 3 THEN 'DIAPER' WHEN 4 THEN 'TEMPERATURE' WHEN 5 THEN 'HEIGHT' WHEN 6 THEN 'WEIGHT' WHEN 7 THEN 'VACCINE' ELSE 'MEAL' END,printf('2026-08-%02d %02d:00:00',1+(x%27),x%24),CASE x%10 WHEN 2 THEN 'WET' WHEN 3 THEN 'DIRTY' END,CASE x%10 WHEN 0 THEN 120 WHEN 4 THEN 36.5 WHEN 5 THEN 70 WHEN 6 THEN 8 END,CASE x%10 WHEN 0 THEN 'ml' WHEN 4 THEN '℃' WHEN 5 THEN 'cm' WHEN 6 THEN 'kg' END,CASE WHEN x%10=1 THEN 60 END,CASE WHEN x%10=7 THEN '架空ワクチン' END,NULL,911,'2026-08-27','2026-08-27',CASE WHEN x=1 THEN '2026-08-27' END FROM n;
SQL
# SQL aggregate stays compact and excludes deleted rows; JST strings group on their displayed calendar date.
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM (SELECT date(occurred_at),log_type,detail_code FROM family_logs WHERE family_id=91 AND subject_id=1 AND deleted_at IS NULL GROUP BY date(occurred_at),log_type,detail_code)")" -lt 300
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=91 AND deleted_at IS NULL")" = 2499
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=91 AND log_type='VACCINE' AND deleted_at IS NULL")" -gt 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_family_logs_active_subject_type_occurred'")" = 1
echo 'wave91 dashboard smoke: ok'
