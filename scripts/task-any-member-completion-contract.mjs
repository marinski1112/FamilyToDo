import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';

const read=path=>fs.readFileSync(path,'utf8');
const toggle=read('src/toggle-api.ts');
const parent=read('src/task-parent-completion-api.ts');
const projection=read('src/recurrence-projection.ts');
for(const [name,source] of [['toggle',toggle],['parent completion',parent],['recurrence projection',projection]]){
  assert.doesNotMatch(source,/task_assignees|assignedCount|mode==='ALL'/,`${name}: old assignee rows cannot restrict completion`);
}
assert.match(toggle,/DELETE FROM task_completions WHERE task_id=\?'/,'any family member can undo the shared Task check');
assert.match(toggle,/DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=\?'/,'any family member can undo a recurring occurrence check');
assert.match(toggle,/taskVisibilitySql\('t'\)/,'private Task ownership remains enforced');

const compiled=await transform(read('src/task-completion-reconciliation.ts'),{loader:'ts',format:'esm'});
const {reconcileTaskCompletionAfterAssigneeChange:reconcile}=await import(`data:text/javascript,${encodeURIComponent(compiled.code)}`);
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks(id INTEGER PRIMARY KEY,family_id INTEGER,status TEXT,completion_mode TEXT,completed_by INTEGER,completed_at TEXT,updated_at TEXT);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,active INTEGER);
CREATE TABLE task_completions(task_id INTEGER,member_id INTEGER,completed_at TEXT);
CREATE TABLE task_completion_history(task_id INTEGER,member_id INTEGER,action TEXT);
INSERT INTO tasks VALUES(1,2,'pending','ALL',NULL,NULL,NULL);
INSERT INTO members VALUES(10,2,1),(11,2,1),(12,3,1);
INSERT INTO task_completions VALUES(1,11,'2026-09-24 10:00:00'),(1,12,'2026-09-24 11:00:00');
INSERT INTO task_completion_history VALUES(1,11,'COMPLETED');`);
const adapter={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {first:async()=>stmt.get(...args),run:async()=>stmt.run(...args)}}}}};
await reconcile(adapter,2,1,'2026-09-24 12:00:00');
assert.deepEqual({...db.prepare('SELECT status,completed_by FROM tasks WHERE id=1').get()},{status:'completed',completed_by:11});
assert.equal(db.prepare('SELECT COUNT(*) n FROM task_completion_history').get().n,1,'completion history remains');
db.prepare('DELETE FROM task_completions WHERE task_id=1 AND member_id=11').run();
await reconcile(adapter,2,1,'2026-09-24 12:01:00');
assert.equal(db.prepare('SELECT status FROM tasks WHERE id=1').get().status,'pending','other family completion does not count');
db.close();
console.log('Task completion: all active family members may act, one completion is enough, history retained');
