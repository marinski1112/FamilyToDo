import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync('src/family-log-page.ts','utf8');
assert.ok(source.includes("l.occurred_at>=p.start_at AND l.occurred_at<(date('now','+9 hours','+1 day')"));
assert.ok(source.includes("l.occurred_at>=(MIN(date('now','+9 hours','-6 days'),date('now','+9 hours','start of month'))||' 00:00:00')"));
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE family_logs(id INTEGER PRIMARY KEY,family_id INTEGER,subject_id INTEGER,log_type TEXT,occurred_at TEXT,deleted_at TEXT,quick_chore_id INTEGER,created_by INTEGER);
CREATE TABLE family_quick_chores(id INTEGER PRIMARY KEY,family_id INTEGER,name TEXT,icon TEXT,active INTEGER);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,name TEXT);
CREATE INDEX idx_family_logs_family_occurred ON family_logs(family_id,occurred_at DESC,id DESC);`);
const insert=db.prepare('INSERT INTO family_logs VALUES(?,?,?,?,?,?,?,?)');
for(let i=1;i<=4000;i++)insert.run(i,1,1,'MILK',`2026-09-${String(1+i%26).padStart(2,'0')} 08:00:00`,null,null,1);
for(let i=4001;i<=4030;i++)insert.run(i,i%7===0?2:1,null,'HOUSEWORK',`2026-09-${String(1+i%26).padStart(2,'0')} 10:00:00`,i%9===0?'deleted':null,i%3,1);
const sql=`WITH periods(period,start_at) AS (SELECT '7d','2026-09-21 00:00:00' UNION ALL SELECT 'month','2026-09-01 00:00:00') SELECT p.period,l.quick_chore_id,q.name chore_name,q.icon chore_icon,q.active chore_active,l.created_by,cm.name recorder_name,COUNT(*) count FROM periods p JOIN family_logs l ON l.family_id=? AND l.log_type='HOUSEWORK' AND l.deleted_at IS NULL AND l.occurred_at>=(MIN(date('2026-09-27','-6 days'),date('2026-09-27','start of month'))||' 00:00:00') AND l.occurred_at>=p.start_at AND l.occurred_at<'2026-09-28 00:00:00' LEFT JOIN family_quick_chores q ON q.id=l.quick_chore_id AND q.family_id=l.family_id LEFT JOIN members cm ON cm.id=l.created_by AND cm.family_id=l.family_id GROUP BY p.period,l.quick_chore_id,q.name,q.icon,q.active,l.created_by,cm.name ORDER BY p.period,count DESC,l.quick_chore_id,l.created_by`;
const before=db.prepare(sql).all(1);
for(const [period,start] of [['7d','2026-09-21 00:00:00'],['month','2026-09-01 00:00:00']]){
  const expected=db.prepare("SELECT COUNT(*) count FROM family_logs WHERE family_id=1 AND log_type='HOUSEWORK' AND deleted_at IS NULL AND occurred_at>=? AND occurred_at<'2026-09-28 00:00:00'").get(start).count;
  assert.equal(before.filter(row=>row.period===period).reduce((n,row)=>n+row.count,0),expected);
}
db.exec(fs.readFileSync('migrations/0113_family_log_housework_range_index.sql','utf8'));
db.exec(fs.readFileSync('migrations/0113_family_log_housework_range_index.sql','utf8'));
assert.deepEqual(db.prepare(sql).all(1),before,'partial index preserves both summary periods and deleted-row exclusion');
const plan=db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1).map(row=>row.detail).join(' ');
assert.match(plan,/idx_family_logs_housework_range \(family_id=\? AND occurred_at>\? AND occurred_at<\?\)/);
db.close();
console.log('family log housework: bounded range uses partial index without changing summaries');
