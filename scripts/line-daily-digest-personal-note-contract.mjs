import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
await import('./line-morning-five-facts-contract.mjs');
const code=path=>stripTypeScriptTypes(fs.readFileSync(path,'utf8').replace(/^import .*$/gm,''),{mode:'strip'}).replace(/\bexport /g,'');
const sql=[];
const ctx=vm.createContext({
  recurringForFamilyRange:async()=>[],
  goodsVisibilitySql:alias=>`(${alias}.visibility_scope='FAMILY' OR (${alias}.visibility_scope='PRIVATE' AND ${alias}.private_owner_id=?))`,
});
vm.runInContext(code('src/line-daily-digest.ts'),ctx);
const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){sql.push({query,args});return {results:[]};}}}};
await ctx.buildFactPayload({DB:db},42,1,'2026-09-25');
const task=sql.find(row=>row.query.includes('SELECT t.title'));
assert.ok(task&&task.query.includes("t.visibility_scope='PRIVATE' AND t.private_owner_id=?"));
const fixture=new DatabaseSync(':memory:');
fixture.exec(`CREATE TABLE tasks(id INTEGER,family_id INTEGER,title TEXT,task_kind TEXT,status TEXT,start_at TEXT,end_at TEXT,due_at TEXT,visibility_scope TEXT,private_owner_id INTEGER,all_day INTEGER);
CREATE TABLE recurrence_rules(family_id INTEGER,task_id INTEGER,id INTEGER);
CREATE TABLE recurrence_occurrences(family_id INTEGER,recurrence_rule_id INTEGER,exception_task_id INTEGER);
INSERT INTO tasks VALUES(1,42,'共有の提出','TASK','pending','2026-09-25',NULL,NULL,'FAMILY',NULL,0),(2,42,'自分だけ','TASK','pending','2026-09-25',NULL,NULL,'PRIVATE',1,0),(3,42,'他人だけ','TASK','pending','2026-09-25',NULL,NULL,'PRIVATE',2,0),(4,42,'完了済み','TASK','completed','2026-09-25',NULL,NULL,'FAMILY',NULL,0),(5,42,'今日のイベント','EVENT','pending','2026-09-25',NULL,NULL,'FAMILY',NULL,0),(6,42,'昨日から未完了','TASK','pending','2026-09-24',NULL,NULL,'FAMILY',NULL,0);`);
const rows=fixture.prepare(task.query).all(...task.args);
assert.deepEqual(rows.map(row=>row.title),['昨日から未完了','共有の提出','自分だけ','今日のイベント']);
const shared=fixture.prepare(task.query).all(0,42,0,0,0,'2026-09-25','2026-09-25',0,'2026-09-25');
assert.deepEqual(shared.map(row=>row.title),['昨日から未完了','共有の提出','今日のイベント']);
fixture.close();
console.log('morning facts: task/occurrence SQL retains PRIVATE owner boundary and shared destination scope');
