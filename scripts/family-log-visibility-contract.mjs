import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const app=retainedAppContractSource();
const js=read('public/assets/family-log.js')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+read('public/assets/family-log-core.js'):'');
const migration92=read('migrations/0029_wave92_family_log_settings.sql');
const migration91=read('migrations/0028_wave91_family_log_dashboard_index.sql');
const has=(text,token)=>assert.ok(text.includes(token),`missing ${token}`);

has(app,'data-dashboard-loaded');
assert.ok(!/<details class="card family-log-dashboard" open/.test(app),'dashboard must default collapsed');
const body=app.indexOf('const dailyBody=`<div class="page-head family-log-head"');
const quick=app.indexOf('family-log-quick-card',body);
const dashboard=app.indexOf('${dashboardHtml}',body);
assert.ok(body>=0&&quick>=0&&dashboard>=0&&quick<dashboard,'quick record must precede dashboard');
for(const token of ['show_adult_logs','family_log_settings','settings_update',"hidden_adult.subject_kind='ADULT'",'l.created_by=?','LIMIT 51 OFFSET ?','idx_family_logs_active_subject_type_occurred'])
  has(app+migration91,token);
has(app,"subjects.results.filter(s=>showAdultLogs||familyLogSubjectKind(s.subject_kind)!=='ADULT')");
has(app,"else if(!subjectId)throw new BadRequest('記録対象を選択してください。')");
has(js,'subjectMap[subjectValue]');
has(js,"action:'settings_update'");
has(migration92,'DEFAULT 1');
assert.ok(!app.includes('LIMIT 2500'),'raw 2500-row fetch regression');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-wave92-'));
const db=path.join(dir,'contract.sqlite');
const sqlite=(sql)=>{
  const result=spawnSync('sqlite3',[db],{input:sql,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||`sqlite3 exited ${result.status}`);
  return result.stdout.trim();
};
try{
  for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())sqlite(read(path.join('migrations',name)));
  sqlite(`
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(92,'W92','Wave92','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(921,92,'mother','母','OWNER',1,'2026-08-27','2026-08-27'),(922,92,'father','父','MEMBER',1,'2026-08-27','2026-08-27');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_at,updated_at) VALUES(921,92,'Baby','BABY',1,'2026-08-27','2026-08-27'),(922,92,'Mother','ADULT',1,'2026-08-27','2026-08-27');
INSERT INTO family_logs(id,family_id,subject_id,log_type,occurred_at,created_by,created_at,updated_at,import_batch_id,import_source_key) VALUES(921,92,921,'MILK','2026-08-27 08:00:00',921,'2026-08-27','2026-08-27',NULL,'piyo-baby'),(922,92,922,'CONDITION','2026-08-27 09:00:00',921,'2026-08-27','2026-08-27',NULL,NULL);
INSERT INTO family_log_settings(family_id,show_adult_logs,created_at,updated_at) VALUES(92,0,'2026-08-27','2026-08-27');
`);
  const adultFilter="NOT EXISTS (SELECT 1 FROM family_log_subjects hidden_adult WHERE hidden_adult.id=l.subject_id AND hidden_adult.family_id=l.family_id AND hidden_adult.subject_kind='ADULT')";
  assert.equal(sqlite(`SELECT COUNT(*) FROM family_logs l WHERE l.family_id=92 AND ${adultFilter};`),'1');
  assert.equal(sqlite('SELECT COUNT(*) FROM family_logs WHERE family_id=92 AND subject_id=922;'),'1');
  assert.equal(sqlite(`SELECT COUNT(*) FROM family_logs l WHERE l.family_id=92 AND l.created_by=921 AND ${adultFilter};`),'1');
  sqlite('UPDATE family_log_settings SET show_adult_logs=1 WHERE family_id=92;');
  assert.equal(sqlite('SELECT COUNT(*) FROM family_logs WHERE family_id=92;'),'2');
  assert.equal(sqlite("SELECT COUNT(*) FROM family_logs WHERE id=921 AND subject_id=921 AND import_source_key='piyo-baby';"),'1');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}

console.log('family-log-visibility-contract: visibility, pagination, quick-record, settings, and DB filtering ok');
