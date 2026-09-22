import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,context,loadTs} from './goods-category-test-support.mjs';
const {completionThreshold,completionVisible,completionTimeSql,nextCompletionBoundary,cleanupCompletedGoods}=loadTs('src/checklist-completion.ts');
const {taskEvents}=loadTs('src/task-events-page.ts');
const {calendar}=loadTs('src/calendar-page.ts');
const {itemApi}=loadTs('src/item-api.ts');
const at=s=>Date.parse(s+'+09:00');
for(const [clock,threshold,next] of [
 ['2026-09-22T22:59:59','2026-09-22 00:00:00','2026-09-23T00:00:00'],
 ['2026-09-22T23:00:00','2026-09-22 00:00:00','2026-09-23T00:00:00'],
 ['2026-09-23T00:00:00','2026-09-22 23:00:00','2026-09-23T01:00:00'],
 ['2026-09-23T00:59:59','2026-09-22 23:00:00','2026-09-23T01:00:00'],
 ['2026-09-23T01:00:00','2026-09-23 00:00:00','2026-09-24T00:00:00'],
 ['2026-12-31T23:59:59','2026-12-31 00:00:00','2027-01-01T00:00:00'],
]){assert.equal(completionThreshold(at(clock)),threshold);assert.equal(nextCompletionBoundary(at(clock)),at(next));}
const db=database(),ctx=context(db);
// Every kind, due/undated, private/family and family IDs obey the same instant.
for(const table of ['shopping_items','items'])for(const family of [1,2])for(const [name,when] of [
 ['before23','2026-09-22 22:59:59'],['at23','2026-09-22 23:00:00'],['before00','2026-09-22 23:59:59'],['at00','2026-09-23 00:00:00'],['offset','2026-09-22T14:00:00Z']
]){
 const due=table==='items'?'due_at':'due_date';
 const result=db.prepare(`INSERT INTO ${table}(family_id,name,status,completed_at,${due},created_at,updated_at,visibility_scope,private_owner_id) VALUES(?,?,'completed',?,?,'2026-01-01',?,'PRIVATE',?)`).run(family,name,when,name==='at23'?null:'2026-09-22',when,family);
 const completion=table==='items'?'item_completions':'shopping_completions',ref=table==='items'?'item_id':'shopping_item_id';
 db.prepare(`INSERT INTO ${completion}(${ref},member_id,completed_at) VALUES(?,?,?)`).run(result.lastInsertRowid,family,when);
}
for(const table of ['shopping_items','items'])db.exec(`INSERT INTO ${table}(family_id,name,status,completed_at,created_at,updated_at) VALUES(1,'undo','pending','2020-01-01','2020-01-01','2020-01-01')`);
await cleanupCompletedGoods(ctx.env.DB,at('2026-09-22T23:59:59'));
assert.equal(db.prepare('SELECT count(*) n FROM items').get().n,11);
await cleanupCompletedGoods(ctx.env.DB,at('2026-09-23T00:00:00'));
for(const table of ['shopping_items','items']){
 assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE name='before23'`).get().n,0);
 assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE name='at23'`).get().n,2);
 const detail=db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE status='completed' AND (${completionTimeSql()}) < ? ORDER BY (${completionTimeSql()}),id LIMIT 100`).all('2026-09-22 23:00:00').map(r=>r.detail).join(' ');
 assert(detail.includes(`idx_${table}_completed_cleanup`),'indexed bounded cleanup');
}
await cleanupCompletedGoods(ctx.env.DB,at('2026-09-23T01:00:00'));
for(const table of ['shopping_items','items'])assert.deepEqual(db.prepare(`SELECT name FROM ${table} WHERE family_id=1 ORDER BY name`).all().map(r=>r.name),['at00','undo']);
for(const [table,content,ref] of [['item_completions','items','item_id'],['shopping_completions','shopping_items','shopping_item_id']])assert.equal(db.prepare(`SELECT count(*) n FROM ${table} c LEFT JOIN ${content} i ON i.id=c.${ref} WHERE i.id IS NULL`).get().n,0,'no dangling completion rows');
// Null completion times use persisted update time, never reset on each read.
assert.equal(completionVisible({status:'completed',completed_at:null,updated_at:'2026-09-22 22:59:59'},at('2026-09-23T00:00:00')),false);
assert.equal(completionVisible({status:'completed',completed_at:'2026-09-22T14:00:00Z'},at('2026-09-23T00:00:00')),true);
// Actual page and item metadata API use the same clock. Task records and history survive.
const realDate=Date;let clock=at('2026-09-23T00:00:00');
globalThis.Date=class extends realDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
try{
 db.exec("DELETE FROM items; DELETE FROM shopping_items;");
 for(const [title,when] of [['expired-task','2026-09-22 22:59:59'],['late-task','2026-09-22 23:00:00']]){
  const result=db.prepare("INSERT INTO tasks(family_id,title,status,task_kind,due_at,completed_at,created_at,updated_at,calendar_visible) VALUES(1,?,'completed','task','2026-09-22',?,'2026-01-01',?,1)").run(title,when,when);
  db.prepare("INSERT INTO task_completions(task_id,member_id,completed_at) VALUES(?,1,?)").run(result.lastInsertRowid,when);
  db.prepare("INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,1,'COMPLETED',?)").run(result.lastInsertRowid,when);
 }
 for(const table of ['shopping_items','items'])for(const [name,when] of [['expired-goods','2026-09-22 22:59:59'],['late-goods','2026-09-22 23:00:00']]){
  const due=table==='items'?'due_at':'due_date';db.prepare(`INSERT INTO ${table}(family_id,name,status,${due},completed_at,created_at,updated_at,category,url) VALUES(1,?,'completed','2026-09-22',?,'2026-01-01',?,'スーパー','https://example.com/product')`).run(name,when,when);
 }
 const {recurringForDate}=loadTs('src/recurrence-projection.ts');
 for(const [title,when] of [['expired-recurring','2026-09-22 22:59:59'],['late-recurring','2026-09-22 23:00:00']]){
  const task=db.prepare("INSERT INTO tasks(family_id,title,task_kind,start_at,end_at,created_at,updated_at,calendar_visible) VALUES(1,?,'recurring','2026-09-22 08:00:00','2026-09-22 09:00:00','2026-01-01','2026-01-01',1)").run(title);
  db.prepare("INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,start_date,end_date,created_at,updated_at) VALUES(1,?,?,'DAILY','2026-09-22','2026-09-22','2026-01-01','2026-01-01')").run(task.lastInsertRowid,title);
  const projected=await recurringForDate(ctx,'2026-09-22');const occurrence=projected.find(row=>row.title===title);
  db.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,1,?)').run(occurrence.recurrence_occurrence_id,when);
 }
 db.exec("INSERT INTO tasks(family_id,title,parent_task_id,created_at,updated_at) VALUES(1,'pending-child',(SELECT id FROM tasks WHERE title='expired-task'),'2026-01-01','2026-01-01')");
 const page=async date=>(await taskEvents(new Request('https://familytodo.test/app/tasks.php'),ctx,date)).text();
 let html=await page('2026-09-23');
 assert(!html.includes('expired-task'));assert(!html.includes('expired-goods'));assert(html.includes('late-task'));assert(html.includes('late-recurring'),'late recurring survives midnight');assert(!html.includes('expired-recurring'));assert(html.includes('late-goods'),'late yesterday survives midnight on today page');
 assert(html.includes('data-category="スーパー"'));assert(!html.includes('<div class="meta">スーパー'),'no repeated visible category label');assert(html.includes('商品ページ'),'product URL retained');assert(html.includes('completionRefreshAt'));
 let meta=await(await itemApi(new Request('https://familytodo.test/api/item?view=categories&date=2026-09-23'),ctx)).json();assert.equal(meta.items.length,1,'metadata agrees across midnight');
 clock=at('2026-09-23T01:00:00');html=await page('2026-09-22');assert(!html.includes('late-task'));assert(!html.includes('late-recurring'));assert(html.includes('pending-child'),'unfinished child survives expired parent projection');assert(!html.includes('late-goods'),'past checklist cannot resurrect expired completion');
 await cleanupCompletedGoods(ctx.env.DB,clock);assert.equal(db.prepare('SELECT count(*) n FROM tasks WHERE status=\'completed\' AND calendar_visible=1').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM task_completions').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM task_completion_history').get().n,2);
 const calendarHtml=await(await calendar(new Request('https://familytodo.test/app/calendar.php'),ctx,'2026-09')).text();assert(calendarHtml.includes('expired-task'));assert(calendarHtml.includes('late-recurring'));assert(calendarHtml.includes('expired-recurring'));assert.equal(db.prepare('SELECT count(*) n FROM recurrence_occurrence_completions').get().n,2);assert(calendarHtml.includes('late-task'),'actual Calendar still renders completed task history');
 assert.equal(db.prepare('SELECT count(*) n FROM items').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM shopping_items').get().n,0);
}finally{globalThis.Date=realDate;db.close();}
assert(readFileSync('src/index.ts','utf8').includes('cleanupCompletedGoods(env.DB,controller.scheduledTime)'));
console.log('Checklist completion: real SQL/API/page; JST boundaries, date-crossing grace, offsets, undo, indexes, purge, dangling rows, and preserved Task/calendar history passed');
