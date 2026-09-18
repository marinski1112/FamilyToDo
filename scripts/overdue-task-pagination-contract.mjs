import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const page=fs.readFileSync('src/task-events-page.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');
const migration=fs.readFileSync('migrations/0093_task_overdue_seek.sql','utf8');

for(const marker of [
  'const OVERDUE_TASK_PAGE_SIZE=50;',
  'async function expiredTaskPageFor(ctx:AppContext,date:string,cursor?:OverdueTaskCursor):Promise<Row[]>{',
  'LIMIT ${OVERDUE_TASK_PAGE_SIZE+1}',
  'async function expiredTasksFor(ctx:AppContext,date:string):Promise<Row[]>{',
  'return expiredTaskPageFor(ctx,date);',
  "requestUrl.searchParams.get('overdue')==='tasks'",
  "requestUrl.searchParams.get('cursor_due')",
  "requestUrl.searchParams.get('cursor_id')",
  'renderExpiredTaskRows(visibleExpiredTasks)',
  'class="btn secondary expired-task-more"',
])assert.ok(page.includes(marker),`overdue Task paging marker missing: ${marker}`);
for(const marker of [
  "document.querySelector('.expired-task-more')",
  "overdue:'tasks'",
  "cursor_due:button.dataset.cursorDue||''",
  "cursor_id:button.dataset.cursorId||''",
  "insertAdjacentHTML('beforeend',String(data.html||''))",
  "alert('期限切れタスクの続きを読み込めませんでした。')",
])assert.ok(browser.includes(marker),`overdue Task browser paging marker missing: ${marker}`);
for(const marker of [
  'CREATE INDEX idx_tasks_overdue_seek',
  'ON tasks(family_id, COALESCE(end_at,due_at,start_at), id)',
  "WHERE status='pending'",
  "AND (task_kind IS NULL OR lower(task_kind)='task')",
  'AND COALESCE(end_at,due_at,start_at) IS NOT NULL',
])assert.ok(migration.includes(marker),`overdue Task seek-index marker missing: ${marker}`);

const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks(
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  status TEXT,
  task_kind TEXT,
  end_at TEXT,
  due_at TEXT,
  start_at TEXT,
  visibility_scope TEXT,
  private_owner_id INTEGER,
  title TEXT,
  location TEXT
);
CREATE INDEX idx_tasks_status ON tasks(family_id,status);`);

const baseSql=`SELECT t.id,COALESCE(t.end_at,t.due_at,t.start_at) AS effective_due
FROM tasks t
WHERE t.family_id=?
  AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))
  AND t.status='pending'
  AND (t.task_kind IS NULL OR lower(t.task_kind)='task')
  AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
  AND date(COALESCE(t.end_at,t.due_at,t.start_at)) < date(?)`;
const orderedSql=`${baseSql}\nORDER BY COALESCE(t.end_at,t.due_at,t.start_at),t.id LIMIT 51`;
const planText=(sql,params)=>db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map(row=>String(row.detail||'')).join('\n');
const beforePlan=planText(orderedSql,[1,2,'2026-09-18']);
assert.match(beforePlan,/idx_tasks_status/,'fixture baseline must use the existing family/status index');
assert.match(beforePlan,/TEMP B-TREE FOR ORDER BY/,'fixture baseline must expose the overdue sort cost');

db.exec(migration);
const afterPlan=planText(orderedSql,[1,2,'2026-09-18']);
assert.match(afterPlan,/idx_tasks_overdue_seek/,'overdue paging must use the additive seek index');
assert.doesNotMatch(afterPlan,/TEMP B-TREE FOR ORDER BY/,'seek index must remove the overdue temporary sort in the local SQLite plan');

const insert=db.prepare(`INSERT INTO tasks(id,family_id,status,task_kind,due_at,visibility_scope,private_owner_id,title)
VALUES(?,1,'pending','task',?,?,?,?)`);
const start=Date.UTC(2020,0,1);
for(let id=1;id<=10000;id++){
  const due=new Date(start+(id%2400)*86400000+(id%1440)*60000).toISOString().replace('T',' ').slice(0,19);
  const privateRow=id%97===0;
  insert.run(id,due,privateRow?'PRIVATE':'FAMILY',privateRow?(id%194===0?2:999):null,`fixture-${id}`);
}
const first=db.prepare(orderedSql).all(1,2,'2026-09-18');
assert.equal(first.length,51,'initial overdue query must return only page size + sentinel');
const visible=first.slice(0,50);
const last=visible.at(-1);
assert.ok(last,'first overdue page must expose a continuation cursor');
const nextSql=`${baseSql}
  AND (COALESCE(t.end_at,t.due_at,t.start_at),t.id) > (?,?)
ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),t.id LIMIT 51`;
const second=db.prepare(nextSql).all(1,2,'2026-09-18',last.effective_due,last.id);
assert.ok(second.length>0,'second overdue page must remain reachable');
assert.notEqual(Number(second[0].id),Number(last.id),'keyset continuation must not repeat the last visible row');
const combined=[...visible,...second.slice(0,50)];
for(let i=1;i<combined.length;i++){
  const previous=combined[i-1],current=combined[i];
  assert.ok(String(previous.effective_due)<String(current.effective_due)||(String(previous.effective_due)===String(current.effective_due)&&Number(previous.id)<Number(current.id)),'overdue keyset pages must preserve canonical effective-deadline/id order');
}
assert.ok(combined.every(row=>Number(row.id)%97!==0||Number(row.id)%194===0),'overdue pages must retain PRIVATE owner filtering');

console.log('overdue Task pagination contract: bounded 50+sentinel pages, keyset continuation, PRIVATE filtering, and seek-index plan ok');
