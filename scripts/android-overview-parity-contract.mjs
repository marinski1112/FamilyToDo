import assert from 'node:assert/strict';
import {database,context,loadTs} from './goods-category-test-support.mjs';
const {androidOverviewApi}=loadTs('src/android-overview-api.ts');
const {completionVisible}=loadTs('src/checklist-completion.ts');
const realNow=Date.now,clock=Date.parse('2026-10-02T00:30:00+09:00');
Date.now=()=>clock;
const db=database(),ctx=context(db);
let childSql;const prepare=ctx.env.DB.prepare.bind(ctx.env.DB);
ctx.env.DB.prepare=sql=>{if(sql.includes("SELECT c.id,c.parent_task_id"))childSql=sql;return prepare(sql);};
try {
 for(const table of ['shopping_items','items']) {
  const due=table==='items'?'due_at':'due_date';
  for(const [name,status,time,date,family,scope,owner] of [
   ['fresh-undated','completed','2026-10-01 23:30:00',null,1,'FAMILY',null],
   ['old-undated','completed','2026-10-01 22:59:59',null,1,'FAMILY',null],
   ['utc-undated','completed','2026-10-01T14:00:00Z',null,1,'PRIVATE',1],
   ['dated-history','completed','2026-09-01 12:00:00','2026-10-02',1,'FAMILY',null],
   ['other-private','completed','2026-10-02 00:00:00',null,1,'PRIVATE',2],
   ['owner-missing','completed','2026-10-02 00:00:00',null,1,'PRIVATE',null],
   ['other-family','completed','2026-10-02 00:00:00',null,2,'FAMILY',null],
   ['pending','pending','2020-01-01 00:00:00',null,1,'FAMILY',null],
  ])db.prepare(`INSERT INTO ${table}(family_id,name,status,completed_at,updated_at,created_at,${due},visibility_scope,private_owner_id) VALUES(?,?,?,?,?,?,?,?,?)`).run(family,name,status,time,time,'2020-01-01',date,scope,owner);
 }
 db.exec("INSERT INTO tasks(family_id,title,task_kind,status,start_at,sort_order,created_at,updated_at) VALUES(1,'ordered','EVENT','pending','2026-10-02 09:00:00',17,'2020-01-01','2020-01-01')");
 const get=()=>androidOverviewApi(new Request('https://familytodo.test/api/android/v1/overview?month=2026-10'),ctx);
 const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const data=await response.json();assert.equal(data.tasks[0].sort_order,17);
 for(const key of ['shopping','items']) {
  assert.deepEqual(data[key].map(r=>r.name).sort(),['dated-history','fresh-undated','pending','utc-undated']);
  assert.deepEqual(data[key].filter(r=>completionVisible(r,clock)).map(r=>r.name).sort(),['fresh-undated','pending','utc-undated'],'checklist retention independent of calendar month');
  assert.equal(data[key].find(r=>r.name==='fresh-undated').completed_at,'2026-10-01 23:30:00');
 }
 Date.now=()=>clock+30*60000;
 const after=await (await get()).json();
 for(const key of ['shopping','items'])assert.deepEqual(after[key].map(r=>r.name).sort(),['dated-history','pending'],'undated grace ends exactly at 01:00');
 // Only children of returned authorised root tasks contribute to Calendar counts.
 const root=Number(db.prepare("INSERT INTO tasks(family_id,title,task_kind,status,due_at,created_at,updated_at) VALUES(1,'parent','TASK','pending','2026-10-02','2020-01-01','2020-01-01')").run().lastInsertRowid);
 const child=(family,scope,owner,date=null)=>db.prepare("INSERT INTO tasks(family_id,title,task_kind,status,parent_task_id,due_at,visibility_scope,private_owner_id,created_at,updated_at) VALUES(?,'child','TASK','pending',?,?,?,?, '2020-01-01','2020-01-01')").run(family,root,date,scope,owner);
 child(1,'FAMILY',null);child(1,'PRIVATE',1);child(1,'PRIVATE',2);child(1,'PRIVATE',null);child(2,'FAMILY',null);child(1,'FAMILY',null,'2026-10-02');
 const withChildren=await (await get()).json();assert.equal(withChildren.undatedChildren.length,2);
 assert(withChildren.undatedChildren.every(c=>c.parent_task_id===root&&!('title' in c)),'minimal authorised child metadata');
 assert(withChildren.tasks.some(t=>t.parent_task_id===root),'dated child carries parent metadata');
 const plan=db.prepare('EXPLAIN QUERY PLAN '+childSql).all(JSON.stringify([root]),1,1,501).map(r=>r.detail).join(' ');
 assert.match(plan,/idx_tasks_family_parent.*family_id=\? AND parent_task_id=\?/,'child read seeks each returned parent through existing family/parent index');
 const hiddenRoot=Number(db.prepare("INSERT INTO tasks(family_id,title,task_kind,status,due_at,visibility_scope,private_owner_id,created_at,updated_at) VALUES(1,'hidden-parent','TASK','pending','2026-10-02','PRIVATE',2,'2020-01-01','2020-01-01')").run().lastInsertRowid);
 db.prepare("INSERT INTO tasks(family_id,title,task_kind,status,parent_task_id,created_at,updated_at) VALUES(1,'hidden-root-child','TASK','pending',?,'2020-01-01','2020-01-01')").run(hiddenRoot);
 assert.equal((await (await get()).json()).undatedChildren.length,2,'outside visible roots excluded');
 // Undo overrides the old completion timestamp, and pending rows stay visible.
 db.exec("UPDATE shopping_items SET status='pending' WHERE name='old-undated'");
 assert((await (await get()).json()).shopping.some(r=>r.name==='old-undated'));
 assert.equal((await androidOverviewApi(new Request('https://familytodo.test/api/android/v1/overview?month=1999-12'),ctx)).status,400);
 const anon={...ctx,member:null};assert.equal((await androidOverviewApi(new Request('https://familytodo.test/api/android/v1/overview?month=2026-10'),anon)).status,401);
 assert.equal((await androidOverviewApi(new Request('https://familytodo.test/api/android/v1/overview?month=2026-10',{method:'POST'}),ctx)).status,405);
 for(let n=0;n<501;n++)db.prepare("INSERT INTO items(family_id,name,status,created_at,updated_at) VALUES(1,?,'pending','2020-01-01','2020-01-01')").run('bounded-'+n);
 const capped=await (await get()).json();assert.equal(capped.items.length,500);assert.equal(capped.truncated,true);
 for(let n=0;n<501;n++)child(1,'FAMILY',null);
 const childCap=await (await get()).json();assert.equal(childCap.undatedChildren.length,500);assert.equal(childCap.truncated,true);
 console.log('Android overview parity: real SQL, retention boundaries, offsets, privacy, undo, calendar history, ordering and limits passed');
} finally {Date.now=realNow;db.close();}
