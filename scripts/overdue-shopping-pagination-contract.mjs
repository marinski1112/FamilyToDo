import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const helper=fs.readFileSync('src/overdue-shopping.ts','utf8');
const page=fs.readFileSync('src/task-events-page.ts','utf8');
const browser=fs.readFileSync('public/assets/task-events.js','utf8');
const migration=fs.readFileSync('migrations/0094_shopping_overdue_seek.sql','utf8');
const browserSyntax=spawnSync(process.execPath,['--check','public/assets/task-events.js'],{encoding:'utf8'});
assert.equal(browserSyntax.status,0,browserSyntax.stderr||browserSyntax.stdout||'Task events browser syntax invalid');

for(const marker of [
  'export const OVERDUE_SHOPPING_PAGE_SIZE=50;',
  "s.task_id IS NULL AND s.status<>'completed'",
  "s.task_id IS NOT NULL AND ${parentVisible} AND s.status<>'completed'",
  'AND s.due_date IS NULL',
  "(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id) > (?,?,?,?,?)",
  '.slice(0,pageLimit)',
  'export function renderOverdueShoppingRows(items:Row[]):string{',
])assert.ok(helper.includes(marker),`overdue Shopping helper marker missing: ${marker}`);
for(const marker of [
  'expiredShoppingPageFor(ctx,date)',
  "requestUrl.searchParams.get('overdue')==='shopping'",
  'renderOverdueShoppingRows(visibleExpiredShopping)',
  'class="btn secondary expired-shopping-more"',
  'expired-shopping-count',
])assert.ok(page.includes(marker),`overdue Shopping page marker missing: ${marker}`);
for(const marker of [
  "document.querySelector('.expired-shopping-more')",
  "overdue:'shopping'",
  "cursor_category_present:overdueShoppingMore.dataset.cursorCategoryPresent||''",
  "cursor_name:overdueShoppingMore.dataset.cursorName||''",
  "alert('期限切れ買い物の続きを読み込めませんでした。')",
])assert.ok(browser.includes(marker),`overdue Shopping browser marker missing: ${marker}`);
for(const marker of [
  'CREATE INDEX idx_shopping_overdue_unlinked_seek',
  'CREATE INDEX idx_shopping_overdue_linked_seek',
  "WHERE status<>'completed'",
  'AND task_id IS NULL',
  'AND task_id IS NOT NULL',
])assert.ok(migration.includes(marker),`overdue Shopping seek-index marker missing: ${marker}`);
assert.ok(!migration.includes('idx_shopping_overdue_parent_fallback'),'unused fallback index must not be introduced');

const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks(
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  title TEXT,
  start_at TEXT,
  end_at TEXT,
  due_at TEXT,
  visibility_scope TEXT,
  private_owner_id INTEGER
);
CREATE TABLE shopping_items(
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  memo TEXT,
  due_date TEXT,
  status TEXT NOT NULL,
  completed_by INTEGER,
  completed_at TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  task_id INTEGER,
  url TEXT
);
CREATE INDEX idx_shopping_family ON shopping_items(family_id);
CREATE INDEX idx_shopping_due ON shopping_items(family_id,due_date);
CREATE INDEX idx_shopping_status ON shopping_items(family_id,status);
CREATE INDEX idx_shopping_task ON shopping_items(task_id);`);

const cutoff='2026-09-18',familyId=1,memberId=2,limit=51;
const currentSql=`SELECT s.id,s.name,s.category,s.due_date,s.task_id,
  COALESCE(s.due_date,t.end_at,t.due_at,t.start_at) AS effective_due
FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
WHERE s.family_id=?
  AND (s.task_id IS NULL OR (COALESCE(t.visibility_scope,'FAMILY')='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?)))
  AND s.status<>'completed'
  AND COALESCE(s.due_date,t.end_at,t.due_at,t.start_at) IS NOT NULL
  AND date(COALESCE(s.due_date,t.end_at,t.due_at,t.start_at))<date(?)
ORDER BY COALESCE(s.due_date,t.end_at,t.due_at,t.start_at),s.category,s.name,s.id`;
const beforePlan=db.prepare(`EXPLAIN QUERY PLAN ${currentSql}`).all(familyId,memberId,cutoff).map(row=>String(row.detail||'')).join('\n');
assert.match(beforePlan,/TEMP B-TREE FOR ORDER BY/,'fixture baseline must expose the combined overdue Shopping sort');

db.exec(migration);
const cursorClause=(effective)=>` AND (${effective},(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id) > (?,?,?,?,?)`;
const branchSql=(kind,cursor=false)=>{
  const cursorA=cursor?cursorClause('s.due_date'):'';
  const cursorC=cursor?cursorClause('COALESCE(t.end_at,t.due_at,t.start_at)'):'';
  if(kind==='unlinked')return `SELECT s.id,s.name,s.category,s.due_date,s.task_id,s.due_date AS effective_due
    FROM shopping_items s
    WHERE s.family_id=? AND s.task_id IS NULL AND s.status<>'completed'
      AND s.due_date IS NOT NULL AND date(s.due_date)<date(?)${cursorA}
    ORDER BY s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id LIMIT ${limit}`;
  if(kind==='linked')return `SELECT s.id,s.name,s.category,s.due_date,s.task_id,s.due_date AS effective_due
    FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
    WHERE s.family_id=? AND s.task_id IS NOT NULL
      AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))
      AND s.status<>'completed' AND s.due_date IS NOT NULL AND date(s.due_date)<date(?)${cursorA}
    ORDER BY s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id LIMIT ${limit}`;
  return `SELECT s.id,s.name,s.category,s.due_date,s.task_id,COALESCE(t.end_at,t.due_at,t.start_at) AS effective_due
    FROM shopping_items s JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
    WHERE s.family_id=? AND s.task_id IS NOT NULL
      AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))
      AND s.status<>'completed' AND s.due_date IS NULL
      AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
      AND date(COALESCE(t.end_at,t.due_at,t.start_at))<date(?)${cursorC}
    ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id LIMIT ${limit}`;
};
const plan=(sql,args)=>db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map(row=>String(row.detail||'')).join('\n');
const unlinkedPlan=plan(branchSql('unlinked'),[familyId,cutoff]);
const linkedPlan=plan(branchSql('linked'),[familyId,memberId,cutoff]);
assert.match(unlinkedPlan,/idx_shopping_overdue_unlinked_seek/,'unlinked own-due branch must use its partial seek index');
assert.doesNotMatch(unlinkedPlan,/TEMP B-TREE/,'unlinked own-due branch must not sort into a temp tree');
assert.match(linkedPlan,/idx_shopping_overdue_linked_seek/,'linked own-due branch must use its partial seek index');
assert.doesNotMatch(linkedPlan,/TEMP B-TREE/,'linked own-due branch must not sort into a temp tree');

const taskInsert=db.prepare('INSERT INTO tasks(id,family_id,title,start_at,end_at,due_at,visibility_scope,private_owner_id) VALUES(?,1,?,?,?,?,?,?)');
for(let id=1;id<=2500;id++){
  const day=String((id%260)+1).padStart(3,'0');
  const due=new Date(Date.UTC(2025,11,1)+(Number(day)-1)*86400000).toISOString().replace('T',' ').slice(0,19);
  const slot=id%3;
  taskInsert.run(id,`task-${id}`,slot===0?due:null,slot===1?due:null,slot===2?due:null,id%79===0?'PRIVATE':'FAMILY',id%158===0?memberId:999);
}
const shoppingInsert=db.prepare(`INSERT INTO shopping_items(id,family_id,name,quantity,category,due_date,status,task_id,created_at,updated_at)
VALUES(?,1,?,'1',?,?,'pending',?,'2026-01-01 00:00:00','2026-01-01 00:00:00')`);
const base=Date.UTC(2025,11,1);
for(let id=1;id<=12000;id++){
  const mode=id%10;
  const due=new Date(base+(id%260)*86400000).toISOString().slice(0,10);
  const category=id%11===0?null:`cat-${String(id%17).padStart(2,'0')}`;
  let taskId=null,ownDue=null;
  if(mode<=2)ownDue=due;
  else if(mode<=6){taskId=(id%2500)+1;ownDue=due;}
  else if(mode<=8)taskId=(id%2500)+1;
  shoppingInsert.run(id,`item-${String(id).padStart(5,'0')}`,category,ownDue,taskId);
}
shoppingInsert.run(20001,'orphan-visible',null,'2025-12-01',999999);
db.prepare("UPDATE shopping_items SET status='completed' WHERE id%13=0").run();

const sqliteBinary=(a,b)=>Buffer.compare(Buffer.from(String(a??''),'utf8'),Buffer.from(String(b??''),'utf8'));
const rowCompare=(a,b)=>sqliteBinary(a.effective_due,b.effective_due)||(Number(a.category!=null)-Number(b.category!=null))||sqliteBinary(a.category,b.category)||sqliteBinary(a.name,b.name)||(Number(a.id)-Number(b.id));
const argsFor=(kind,cursor)=>{
  const tail=cursor?[cursor.effective_due,cursor.category==null?0:1,String(cursor.category??''),String(cursor.name),Number(cursor.id)]:[];
  return kind==='unlinked'?[familyId,cutoff,...tail]:[familyId,memberId,cutoff,...tail];
};
const splitPage=(cursor)=>{
  const rows=['unlinked','linked','fallback'].flatMap(kind=>db.prepare(branchSql(kind,Boolean(cursor))).all(...argsFor(kind,cursor)));
  return rows.sort(rowCompare).slice(0,limit);
};
const currentFirst=db.prepare(`${currentSql} LIMIT ${limit}`).all(familyId,memberId,cutoff);
const first=splitPage(null);
assert.deepEqual(first.map(row=>Number(row.id)),currentFirst.map(row=>Number(row.id)),'split first page must preserve the current combined-query order');
assert.equal(first.length,limit,'split page must return page size + sentinel');
assert.ok(first.some(row=>Number(row.id)===20001),'linked own-due orphan rows visible in the current LEFT JOIN contract must remain visible');
const visible=first.slice(0,50),last=visible.at(-1);
assert.ok(last,'first Shopping page must expose a continuation cursor');
const second=splitPage(last);
assert.ok(second.length>0,'second Shopping page must remain reachable');
assert.notEqual(Number(second[0].id),Number(last.id),'Shopping keyset continuation must not repeat the last visible row');
const combined=[...visible,...second.slice(0,50)];
for(let index=1;index<combined.length;index++)assert.ok(rowCompare(combined[index-1],combined[index])<0,'Shopping pages must preserve canonical effective_due/category/name/id order');
assert.ok(combined.every(row=>{
  const taskId=Number(row.task_id||0);if(!taskId)return true;
  const task=db.prepare('SELECT visibility_scope,private_owner_id FROM tasks WHERE id=?').get(taskId);
  return !task||task.visibility_scope!=='PRIVATE'||Number(task.private_owner_id)===memberId;
}),'Shopping pages must retain PRIVATE parent filtering');

console.log('overdue Shopping pagination contract: 3-branch semantic split, exact first-page equivalence, bounded keyset continuation, PRIVATE filtering, own-due seek indexes, and browser syntax ok');
