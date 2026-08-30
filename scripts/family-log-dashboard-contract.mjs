import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/app.ts');
const css=read('public/assets/family.css');
const has=(text,token)=>assert.ok(text.includes(token),`missing ${token}`);

for(const token of [
  'LIMIT 51 OFFSET ?',
  'l.deleted_at IS NULL',
  'GROUP BY date(l.occurred_at),l.log_type,l.detail_code',
  'ROW_NUMBER() OVER',
  'duration_minutes IS NULL',
  "'VACCINE'",
  'timelineType',
  'adultSubjects',
  'この期間の記録はありません',
  'date(l.occurred_at)',
]) has(app,token);
assert.ok(!app.includes('LIMIT 2500'),'raw bulk fetch regression');
for(const token of ['family-log-bars','polyline','family-log-dashboard-grid'])has(css,token);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'familytodo-dashboard-'));
const db=path.join(dir,'contract.sqlite');
const sqlite=sql=>{
  const result=spawnSync('sqlite3',[db],{input:sql,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||`sqlite3 exited ${result.status}`);
  return result.stdout.trim();
};
try{
  for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())sqlite(read(path.join('migrations',name)));
  sqlite(`
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(91,'DASH','Dashboard','2026-08-27','2026-08-27');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(911,91,'dashboard-owner','Adult','OWNER',1,'2026-08-27','2026-08-27');
INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_at,updated_at) VALUES(1,91,'Baby A','BABY',1,'2026-08-27','2026-08-27'),(2,91,'Baby B','BABY',1,'2026-08-27','2026-08-27'),(3,91,'Adult A','ADULT',1,'2026-08-27','2026-08-27'),(4,91,'Adult B','ADULT',1,'2026-08-27','2026-08-27');
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2500)
INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,created_by,created_at,updated_at,deleted_at)
SELECT 91,CASE WHEN x%4=0 THEN 2 WHEN x%4=1 THEN 3 WHEN x%4=2 THEN 4 ELSE 1 END,CASE x%10 WHEN 0 THEN 'MILK' WHEN 1 THEN 'SLEEP' WHEN 2 THEN 'DIAPER' WHEN 3 THEN 'DIAPER' WHEN 4 THEN 'TEMPERATURE' WHEN 5 THEN 'HEIGHT' WHEN 6 THEN 'WEIGHT' WHEN 7 THEN 'VACCINE' ELSE 'MEAL' END,printf('2026-08-%02d %02d:00:00',1+(x%27),x%24),CASE x%10 WHEN 2 THEN 'WET' WHEN 3 THEN 'DIRTY' END,CASE x%10 WHEN 0 THEN 120 WHEN 4 THEN 36.5 WHEN 5 THEN 70 WHEN 6 THEN 8 END,CASE x%10 WHEN 0 THEN 'ml' WHEN 4 THEN '℃' WHEN 5 THEN 'cm' WHEN 6 THEN 'kg' END,CASE WHEN x%10=1 THEN 60 END,CASE WHEN x%10=7 THEN '架空ワクチン' END,NULL,911,'2026-08-27','2026-08-27',CASE WHEN x=1 THEN '2026-08-27' END FROM n;
`);
  assert.ok(Number(sqlite("SELECT COUNT(*) FROM (SELECT date(occurred_at),log_type,detail_code FROM family_logs WHERE family_id=91 AND subject_id=1 AND deleted_at IS NULL GROUP BY date(occurred_at),log_type,detail_code);"))<300,'aggregate should stay compact');
  assert.equal(sqlite('SELECT COUNT(*) FROM family_logs WHERE family_id=91 AND deleted_at IS NULL;'),'2499');
  assert.ok(Number(sqlite("SELECT COUNT(*) FROM family_logs WHERE family_id=91 AND log_type='VACCINE' AND deleted_at IS NULL;"))>0,'vaccine logs should remain represented');
  assert.equal(sqlite("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_family_logs_active_subject_type_occurred';"),'1');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}

console.log('family-log-dashboard-contract: aggregation, pagination, presentation, and DB coverage ok');
