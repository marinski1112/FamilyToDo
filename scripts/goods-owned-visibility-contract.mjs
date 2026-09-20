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
// Execute both shared-set writers with detached private goods. An owner's
// ability to read a private source must never imply permission to share it.
const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},
  async first(){return db.prepare(sql).get(...args)??null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
for(const [file,handler,entries] of [['item-reusable-set-api.ts','handleItemReusableSetAction','item_reusable_set_entries'],['shopping-reusable-set-api.ts','handleShoppingReusableSetAction','shopping_reusable_set_entries']]){
  const sandbox=vm.createContext({Response,URL,Intl,Date,json:(body,status=200)=>new Response(JSON.stringify(body),{status}),goodsVisibilitySql:context.goodsVisibilitySql});
  vm.runInContext(stripTypeScriptTypes(readFileSync('src/'+file,'utf8')).replace(/^import .*;\s*$/gm,'').replace(/export /g,'')+`\nglobalThis.handle=${handler}`,sandbox);
  const owner={id:901,family_id:901,role:'OWNER'},admin={id:902,family_id:901,role:'ADMIN'};
  for(const [actor,ids,status] of [[owner,[3],400],[admin,[3],409],[owner,[1,3],201]]){
    const response=await sandbox.handle({env:{DB}},actor,{action:'reusable_set_create',name:'Mixed',source_item_ids:ids});
    assert.equal(response.status,status);
    if(status===201){const result=await response.json();assert.equal(result.item_count,1);assert.equal(result.skipped_private,1);}
  }
  assert.deepEqual(db.prepare(`SELECT name FROM ${entries}`).all().map(x=>x.name),['row-1']);
}
db.exec('PRAGMA foreign_keys=ON; DELETE FROM members WHERE id=901');
for(const table of ['items','shopping_items'])assert.equal(db.prepare(`SELECT private_owner_id FROM ${table} WHERE id=3`).get().private_owner_id,null);
db.close();
console.log('goods-owned visibility: migration preserves data; private/orphan/foreign-parent rows fail closed; unlink does not widen visibility; shared exports exclude private rows');
