import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';

const source=fs.readFileSync('src/family-daily-journal.ts','utf8');
const compiled=await transform(source.replace(/^import .*;\n/gm,''),{loader:'ts',format:'cjs'});
const context=vm.createContext({module:{exports:{}},exports:{}});
context.exports=context.module.exports;
vm.runInContext(compiled.code,context);
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks(id INTEGER PRIMARY KEY,family_id INTEGER,title TEXT,visibility_scope TEXT,task_kind TEXT);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,name TEXT);
CREATE TABLE task_completion_history(id INTEGER PRIMARY KEY,task_id INTEGER,member_id INTEGER,action TEXT,occurred_at TEXT);
CREATE TABLE family_logs(id INTEGER PRIMARY KEY,family_id INTEGER,log_type TEXT,deleted_at TEXT,occurred_at TEXT,created_by INTEGER,value_text TEXT);
CREATE INDEX idx_family_logs_housework_active_occurred ON family_logs(family_id,occurred_at) WHERE log_type='HOUSEWORK' AND deleted_at IS NULL;`);
db.exec(fs.readFileSync('migrations/0114_family_daily_journal_task_history_range.sql','utf8'));
db.exec(`INSERT INTO members VALUES(1,1,'A'),(2,2,'B');
INSERT INTO tasks VALUES(1,1,'done','FAMILY','TASK'),(2,2,'other family','FAMILY','TASK'),(3,1,'private','PRIVATE','TASK'),(4,1,'event','FAMILY','EVENT');
INSERT INTO task_completion_history VALUES
(1,1,1,'COMPLETED','2026-09-25 23:59:59'),
(2,1,1,'COMPLETED','2026-09-26 00:00:00'),
(3,1,1,'UNCOMPLETED','2026-09-26T01:00:00.000Z'),
(4,1,1,'COMPLETED','2026-09-26T02:00:00.000Z'),
(5,2,2,'COMPLETED','2026-09-26T02:00:00.000Z'),
(6,3,1,'COMPLETED','2026-09-26T02:00:00.000Z'),
(7,4,1,'COMPLETED','2026-09-26T02:00:00.000Z'),
(8,1,1,'COMPLETED','2026-09-27 00:00:00');
INSERT INTO family_logs VALUES
(1,1,'HOUSEWORK',NULL,'2026-09-26 00:00:00',1,'laundry'),
(2,1,'HOUSEWORK',NULL,'2026-09-26T12:00:00.000Z',1,'dishes'),
(3,1,'HOUSEWORK',NULL,'2026-09-27 00:00:00',1,'next day'),
(4,1,'HOUSEWORK','2026-09-26 12:00:00','2026-09-26 12:00:00',1,'deleted'),
(5,2,'HOUSEWORK',NULL,'2026-09-26 12:00:00',2,'other family');`);
let sqls=[];
const adapter={prepare(sql){sqls.push(sql);const stmt=db.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async all(){return {results:stmt.all(...args)}}};}};
const tasks=await vm.runInContext('readTasks',context)(adapter,1,'2026-09-26');
assert.equal(tasks.length,1);
assert.equal(tasks[0].title,'done');
assert.equal(tasks[0].completedAt,'2026-09-26T02:00:00.000Z');
const chores=await vm.runInContext('readHousework',context)(adapter,1,'2026-09-26');
assert.equal(chores.length,2);
assert.deepEqual(chores.map(row=>row.name).join(','),'laundry,dishes');
const taskSql=sqls.find(sql=>sql.includes('idx_task_history_occurred_journal'));
const plan=db.prepare(`EXPLAIN QUERY PLAN ${taskSql}`).all(1,'2026-09-26 00:00:00','2026-09-27 00:00:00',200);
assert.ok(plan.some(row=>String(row.detail).includes('idx_task_history_occurred_journal')&&String(row.detail).includes('occurred_at>?')));
db.close();
console.log('journal repair: day bounds, family filtering, latest completion and indexed history scan');
