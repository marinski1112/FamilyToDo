import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const helper=fs.readFileSync('src/overdue-shopping.ts','utf8');
const page=fs.readFileSync('src/task-events-page.ts','utf8');
const browser=fs.readFileSync('public/assets/overdue-shopping.js','utf8');
const browserSyntax=spawnSync(process.execPath,['--check','public/assets/overdue-shopping.js'],{encoding:'utf8'});
assert.equal(browserSyntax.status,0,browserSyntax.stderr||browserSyntax.stdout||'Overdue Shopping browser syntax invalid');

for(const marker of [
  "import { goodsVisibilitySql } from './goods-visibility';",
  'export const OVERDUE_SHOPPING_PAGE_SIZE=50;',
  "s.status<>'completed'",
  's.due_date IS NOT NULL AND date(s.due_date)<date(?)',
  "(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id) > (?,?,?,?,?)",
  'export function renderOverdueShoppingRows(items:Row[]):string{',
])assert.ok(helper.includes(marker),`overdue Shopping helper marker missing: ${marker}`);
for(const forbidden of ['JOIN tasks','task_title','task_end_at','task_due_at','task_start_at','shopping_assignees','parentVisible'])
  assert.ok(!helper.includes(forbidden),`overdue Shopping must not restore retired task/assignee dependency: ${forbidden}`);
for(const marker of [
  'expiredShoppingPageFor(ctx,date)',
  "requestUrl.searchParams.get('overdue')==='shopping'",
  'renderOverdueShoppingRows(visibleExpiredShopping)',
  'class="btn secondary expired-shopping-more"',
  'expired-shopping-count',
  '/assets/overdue-shopping.js?v=${APP_VERSION}',
])assert.ok(page.includes(marker),`overdue Shopping page marker missing: ${marker}`);
for(const marker of [
  "document.querySelector('.expired-shopping-more')",
  "overdue:'shopping'",
  "cursor_category_present:overdueShoppingMore.dataset.cursorCategoryPresent||''",
  "cursor_name:overdueShoppingMore.dataset.cursorName||''",
  "alert('期限切れ買い物の続きを読み込めませんでした。')",
])assert.ok(browser.includes(marker),`overdue Shopping browser marker missing: ${marker}`);

const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE shopping_items(
 id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL,name TEXT NOT NULL,category TEXT,due_date TEXT,status TEXT NOT NULL,
 task_id INTEGER,visibility_scope TEXT NOT NULL DEFAULT 'FAMILY',private_owner_id INTEGER
);
CREATE INDEX idx_due ON shopping_items(family_id,due_date);`);
const insert=db.prepare("INSERT INTO shopping_items(id,family_id,name,category,due_date,status,task_id,visibility_scope,private_owner_id) VALUES(?,1,?,?,?,'pending',?,?,?)");
for(let id=1;id<=140;id++){
  const due=`2026-09-${String(1+(id%17)).padStart(2,'0')}`;
  const visibility=id%19===0?'PRIVATE':'FAMILY';
  insert.run(id,`item-${String(id).padStart(3,'0')}`,id%4===0?null:`cat-${id%5}`,due,id%3===0?9000+id:null,visibility,visibility==='PRIVATE'?(id%38===0?2:99):null);
}
const cutoff='2026-09-18',memberId=2,limit=51;
const cursorClause=cursor=>cursor?" AND (s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id) > (?,?,?,?,?)":'';
const sql=cursor=>`SELECT s.*,s.due_date AS effective_due FROM shopping_items s
 WHERE s.family_id=? AND (s.visibility_scope='FAMILY' OR (s.visibility_scope='PRIVATE' AND s.private_owner_id IS NOT NULL AND s.private_owner_id=?))
 AND s.status<>'completed' AND s.due_date IS NOT NULL AND date(s.due_date)<date(?)${cursorClause(cursor)}
 ORDER BY s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id LIMIT ${limit}`;
const args=cursor=>[1,memberId,cutoff,...(cursor?[cursor.effective_due,cursor.category==null?0:1,String(cursor.category??''),cursor.name,cursor.id]:[])];
const first=db.prepare(sql(null)).all(...args(null));
assert.equal(first.length,limit,'first page exposes page-size plus sentinel');
assert.ok(first.some(r=>r.task_id!==null),'legacy task_id must not affect independent overdue visibility');
assert.ok(first.every(r=>r.visibility_scope==='FAMILY'||Number(r.private_owner_id)===memberId),'PRIVATE filtering remains goods-owned');
const last=first[49];
const second=db.prepare(sql(last)).all(...args(last));
assert.ok(second.length>0,'keyset continuation remains reachable');
assert.notEqual(second[0].id,last.id,'continuation does not repeat boundary row');
db.close();

console.log('overdue Shopping pagination contract: independent own-due keyset paging and goods-owned PRIVATE filtering ok');
