#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs');
const app=fs.readFileSync('src/app.ts','utf8');
const js=fs.readFileSync('public/assets/family-log.js','utf8')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+fs.readFileSync('public/assets/family-log-core.js','utf8'):'');
const migration=fs.readFileSync('migrations/0029_wave92_family_log_settings.sql','utf8');
const has=(text,token)=>{if(!text.includes(token))throw new Error(`missing ${token}`)};
has(app,'data-dashboard-loaded');
if(/<details class="card family-log-dashboard" open/.test(app))throw new Error('dashboard defaults open');
const body=app.indexOf('const dailyBody=`<div class="page-head family-log-head"');
const quick=app.indexOf('family-log-quick-card',body),dashboard=app.indexOf('${dashboardHtml}',body);
if(body<0||quick<0||dashboard<0||quick>dashboard)throw new Error('quick record must precede dashboard');
for(const token of ['show_adult_logs','family_log_settings','settings_update',"hidden_adult.subject_kind='ADULT'",'l.created_by=?','LIMIT 51 OFFSET ?','idx_family_logs_active_subject_type_occurred'])has(app+fs.readFileSync('migrations/0028_wave91_family_log_dashboard_index.sql','utf8'),token);
has(app,"subjects.results.filter(s=>showAdultLogs||familyLogSubjectKind(s.subject_kind)!=='ADULT')");
has(app,"else if(!subjectId)throw new BadRequest('記録対象を選択してください。')");
has(js,"subjectMap[subjectValue]");
has(js,"action:'settings_update'");
has(migration,'DEFAULT 1');
if(app.includes('LIMIT 2500'))throw new Error('raw 2500-row fetch regression');
JS

db="$(mktemp)"; trap 'rm -f "$db"' EXIT
for migration in migrations/*.sql; do sqlite3 "$db" < "$migration"; done
sqlite3 "$db" <<'SQL'
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(92,'W92','Wave92','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(921,92,'mother','母','OWNER',1,'2026-08-27','2026-08-27'),(922,92,'father','父','MEMBER',1,'2026-08-27','2026-08-27');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_at,updated_at) VALUES(921,92,'Baby','BABY',1,'2026-08-27','2026-08-27'),(922,92,'Mother','ADULT',1,'2026-08-27','2026-08-27');
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,import_batch_id,import_source_key) VALUES(921,92,921,'MILK','2026-08-27 08:00:00',921,'2026-08-27','2026-08-27',NULL,'piyo-baby'),(922,92,922,'CONDITION','2026-08-27 09:00:00',921,'2026-08-27','2026-08-27',NULL,NULL);
INSERT INTO family_log_settings(family_id,show_adult_logs,created_at,updated_at) VALUES(92,0,'2026-08-27','2026-08-27');
SQL
adult_filter="NOT EXISTS (SELECT 1 FROM family_log_subjects hidden_adult WHERE hidden_adult.id=l.subject_id AND hidden_adult.family_id=l.family_id AND hidden_adult.subject_kind='ADULT')"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs l WHERE l.family_id=92 AND $adult_filter")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=92 AND subject_id=922")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs l WHERE l.family_id=92 AND l.created_by=921 AND $adult_filter")" = 1
sqlite3 "$db" "UPDATE family_log_settings SET show_adult_logs=1 WHERE family_id=92"
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE family_id=92")" = 2
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM family_logs WHERE id=921 AND subject_id=921 AND import_source_key='piyo-baby'")" = 1
echo 'wave92 quick-record smoke: ok'
