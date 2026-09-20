import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';

const migration='0099_goods_owned_visibility.sql';
const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')&&x<migration).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
db.exec(`
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(901,'goods-a','A','now','now'),(902,'goods-b','B','now','now');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES
(901,901,'goods-a1','Owner','OWNER',1,'now','now'),(902,901,'goods-a2','Admin','ADMIN',1,'now','now'),(903,902,'goods-b1','Other','OWNER',1,'now','now');
INSERT INTO tasks(id,family_id,title,status,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES
(901,901,'Shared','pending',901,'now','now','FAMILY',NULL),
(902,901,'Private','pending',901,'now','now','PRIVATE',901),
(903,902,'Foreign','pending',903,'now','now','PRIVATE',903),
(904,901,'Ownerless','pending',901,'now','now','PRIVATE',NULL);
`);
const before=new Map();
for(const table of ['items','shopping_items']){
  const insert=db.prepare(`INSERT INTO ${table}(id,family_id,name,status,created_by,created_at,updated_at,task_id,completed_by,completed_at) VALUES(?,901,?,'completed',901,'original','original',?,901,'2026-09-19 10:00:00')`);
  for(const [id,parent] of [[1,null],[2,901],[3,902],[4,903],[5,904],[6,99999]])insert.run(id,'row-'+id,parent);
  before.set(table,db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row=>({...row})));
}
db.exec(readFileSync('migrations/'+migration,'utf8'));
const context=vm.createContext({});
vm.runInContext(stripTypeScriptTypes(readFileSync('src/goods-visibility.ts','utf8')).replace(/export /g,''),context);
const own=context.goodsVisibilitySql('g'),shared=context.sharedGoodsSql('g');
assert.equal((own.match(/\?/g)||[]).length,1,'one actor placeholder');
for(const alias of ['g;DROP TABLE items','g.x','', 'g--'])assert.throws(()=>context.goodsVisibilitySql(alias));
for(const table of ['items','shopping_items']){
  const rows=db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  assert.deepEqual(rows.map(({visibility_scope,private_owner_id,...old})=>old),before.get(table),'migration preserves all existing fields, relations and completion');
  assert.deepEqual(rows.map(row=>[row.visibility_scope,row.private_owner_id]),[['FAMILY',null],['FAMILY',null],['PRIVATE',901],['PRIVATE',null],['PRIVATE',null],['PRIVATE',null]]);
  const visible=member=>db.prepare(`SELECT id FROM ${table} g WHERE g.family_id=901 AND ${own} ORDER BY id`).all(member).map(x=>x.id);
  assert.deepEqual(visible(901),[1,2,3]);
  assert.deepEqual(visible(902),[1,2],'admin cannot access private goods');
  assert.deepEqual(visible(903),[1,2],'foreign parent must not transfer ownership');
  assert.deepEqual(db.prepare(`SELECT id FROM ${table} g WHERE g.family_id=901 AND ${shared} ORDER BY id`).all().map(x=>x.id),[1,2],'shared output must exclude even the actors own private goods');
  // Prove this new policy can safely outlive parent relations; migration itself
  // deliberately does not detach them until all consumers have been converted.
  db.exec(`UPDATE ${table} SET task_id=NULL`);
  assert.deepEqual(visible(901),[1,2,3]);
  assert.deepEqual(visible(902),[1,2]);
}
db.exec('PRAGMA foreign_keys=ON; DELETE FROM members WHERE id=901');
for(const table of ['items','shopping_items'])assert.equal(db.prepare(`SELECT private_owner_id FROM ${table} WHERE id=3`).get().private_owner_id,null);
db.close();
console.log('goods-owned visibility: migration preserves data; private/orphan/foreign-parent rows fail closed; unlink does not widen visibility; shared exports exclude private rows');
