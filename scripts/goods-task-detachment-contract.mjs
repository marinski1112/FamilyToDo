import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const visibilityMigration='0099_goods_owned_visibility.sql';
const detachMigration='0100_goods_task_detachment.sql';
const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')&&x<visibilityMigration).sort())db.exec(readFileSync('migrations/'+name,'utf8'));

db.exec(`
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES
(7101,'detach-a','A','now','now'),(7201,'detach-b','B','now','now');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES
(7101,7101,'detach-a1','Owner A','OWNER',1,'now','now'),
(7102,7101,'detach-a2','Member A','MEMBER',1,'now','now'),
(7201,7201,'detach-b1','Owner B','OWNER',1,'now','now');
INSERT INTO tasks(id,family_id,title,due_at,status,created_by,created_at,updated_at,start_at,end_at,visibility_scope,private_owner_id) VALUES
(7111,7101,'Family parent','2026-09-22 09:00:00','pending',7101,'now','now','2026-09-21 08:00:00','2026-09-23 10:30:00','FAMILY',NULL),
(7112,7101,'Private parent','2026-09-24 11:00:00','pending',7101,'now','now','2026-09-24 08:00:00',NULL,'PRIVATE',7101),
(7211,7201,'Foreign parent','2026-09-30 09:00:00','pending',7201,'now','now','2026-09-29 08:00:00','2026-09-30 18:00:00','PRIVATE',7201);
`);

const goodsFixtures=[
  [1,7111,'completed',7101,'2026-09-20 08:00:00'],
  [2,7111,'pending',null,null],
  [3,7112,'completed',7101,'2026-09-20 09:00:00'],
  [4,7211,'pending',null,null],
  [5,7999,'pending',null,null],
  [6,null,'completed',7102,'2026-09-20 10:00:00'],
];
for(const table of ['items','shopping_items']){
  const insert=db.prepare(`INSERT INTO ${table}(id,family_id,name,status,created_by,created_at,updated_at,task_id,completed_by,completed_at) VALUES(?,7101,?,?,7101,'created','updated',?,?,?)`);
  for(const row of goodsFixtures)insert.run(row[0],`${table}-${row[0]}`,row[2],row[1],row[3],row[4]);
}
db.exec("UPDATE shopping_items SET due_date='2026-09-25' WHERE id=2; UPDATE items SET due_at='2026-09-25 12:00:00' WHERE id=2");

db.exec(`
INSERT INTO item_assignees(item_id,member_id) VALUES(1,7102),(3,7101);
INSERT INTO shopping_assignees(shopping_item_id,member_id) VALUES(1,7102),(3,7101);
INSERT INTO item_completions(item_id,member_id,action,completed_at) VALUES(1,7101,'completed','2026-09-20 08:00:00'),(3,7101,'completed','2026-09-20 09:00:00');
INSERT INTO shopping_completions(shopping_item_id,member_id,action,completed_at) VALUES(1,7101,'completed','2026-09-20 08:00:00'),(3,7101,'completed','2026-09-20 09:00:00');
INSERT INTO item_completion_history(item_id,member_id,action,occurred_at) VALUES(1,7101,'COMPLETED','2026-09-20 08:00:00'),(3,7101,'COMPLETED','2026-09-20 09:00:00');
INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(1,7101,'COMPLETED','2026-09-20 08:00:00'),(3,7101,'COMPLETED','2026-09-20 09:00:00');
INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,occurred_at) VALUES
(7101,7101,'COMPLETED','item',1,'2026-09-20 08:00:00'),
(7101,7101,'COMPLETED','shopping',1,'2026-09-20 08:00:00');
`);

const before={};
for(const table of ['items','shopping_items'])before[table]=db.prepare(`SELECT id,status,completed_by,completed_at,created_at,updated_at FROM ${table} ORDER BY id`).all().map(row=>({...row}));
const historyBefore={
  itemCompletion:Number(db.prepare('SELECT COUNT(*) n FROM item_completions').get().n),
  itemHistory:Number(db.prepare('SELECT COUNT(*) n FROM item_completion_history').get().n),
  shoppingCompletion:Number(db.prepare('SELECT COUNT(*) n FROM shopping_completions').get().n),
  shoppingHistory:Number(db.prepare('SELECT COUNT(*) n FROM shopping_completion_history').get().n),
  activity:Number(db.prepare("SELECT COUNT(*) n FROM activity_logs WHERE target_type IN ('item','shopping')").get().n),
  itemAssignees:Number(db.prepare('SELECT COUNT(*) n FROM item_assignees').get().n),
  shoppingAssignees:Number(db.prepare('SELECT COUNT(*) n FROM shopping_assignees').get().n),
};

db.exec(readFileSync('migrations/'+visibilityMigration,'utf8'));
assert.deepEqual(db.prepare('SELECT id,visibility_scope,private_owner_id FROM items ORDER BY id').all().map(r=>[r.id,r.visibility_scope,r.private_owner_id]),[
  [1,'FAMILY',null],[2,'FAMILY',null],[3,'PRIVATE',7101],[4,'PRIVATE',null],[5,'PRIVATE',null],[6,'FAMILY',null],
]);
assert.deepEqual(db.prepare('SELECT id,visibility_scope,private_owner_id FROM shopping_items ORDER BY id').all().map(r=>[r.id,r.visibility_scope,r.private_owner_id]),[
  [1,'FAMILY',null],[2,'FAMILY',null],[3,'PRIVATE',7101],[4,'PRIVATE',null],[5,'PRIVATE',null],[6,'FAMILY',null],
]);

db.exec(readFileSync('migrations/'+detachMigration,'utf8'));
for(const table of ['items','shopping_items']){
  assert.equal(Number(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE task_id IS NOT NULL`).get().n),0,`${table}: all legacy task links detached`);
  assert.deepEqual(db.prepare(`SELECT id,status,completed_by,completed_at,created_at,updated_at FROM ${table} ORDER BY id`).all().map(row=>({...row})),before[table],`${table}: status/completion/timestamps preserved`);
}
assert.equal(db.prepare('SELECT due_at FROM items WHERE id=1').get().due_at,'2026-09-23 10:30:00','item inherits parent end_at first');
assert.equal(db.prepare('SELECT due_at FROM items WHERE id=2').get().due_at,'2026-09-25 12:00:00','item keeps own deadline');
assert.equal(db.prepare('SELECT due_at FROM items WHERE id=3').get().due_at,'2026-09-24 11:00:00','item falls back to parent due_at');
assert.equal(db.prepare('SELECT due_at FROM items WHERE id=4').get().due_at,null,'cross-family parent deadline is not trusted');
assert.equal(db.prepare('SELECT due_at FROM items WHERE id=5').get().due_at,null,'missing parent deadline is not guessed');
assert.equal(db.prepare('SELECT due_date FROM shopping_items WHERE id=1').get().due_date,'2026-09-23','shopping inherits parent end date');
assert.equal(db.prepare('SELECT due_date FROM shopping_items WHERE id=2').get().due_date,'2026-09-25','shopping keeps own deadline');
assert.equal(db.prepare('SELECT due_date FROM shopping_items WHERE id=3').get().due_date,'2026-09-24','shopping falls back to parent due date');
assert.equal(db.prepare('SELECT due_date FROM shopping_items WHERE id=4').get().due_date,null,'shopping cross-family deadline is not trusted');
assert.equal(db.prepare('SELECT due_date FROM shopping_items WHERE id=5').get().due_date,null,'shopping missing-parent deadline is not guessed');

assert.deepEqual({
  itemCompletion:Number(db.prepare('SELECT COUNT(*) n FROM item_completions').get().n),
  itemHistory:Number(db.prepare('SELECT COUNT(*) n FROM item_completion_history').get().n),
  shoppingCompletion:Number(db.prepare('SELECT COUNT(*) n FROM shopping_completions').get().n),
  shoppingHistory:Number(db.prepare('SELECT COUNT(*) n FROM shopping_completion_history').get().n),
  activity:Number(db.prepare("SELECT COUNT(*) n FROM activity_logs WHERE target_type IN ('item','shopping')").get().n),
  itemAssignees:Number(db.prepare('SELECT COUNT(*) n FROM item_assignees').get().n),
  shoppingAssignees:Number(db.prepare('SELECT COUNT(*) n FROM shopping_assignees').get().n),
},historyBefore,'detachment preserves completion/history/activity and leaves obsolete assignment rows for non-destructive retirement');

db.exec('DELETE FROM tasks WHERE id=7111');
for(const table of ['items','shopping_items'])assert.equal(Number(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE id IN (1,2)`).get().n),2,`${table}: goods survive parent task deletion after detachment`);

console.log('goods task detachment contract passed');
