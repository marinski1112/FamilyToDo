import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {database,context,operations,api} from './goods-category-test-support.mjs';
const sandbox={window:{},document:{readyState:'loading',addEventListener(){}}};vm.runInNewContext(readFileSync('public/assets/goods-category-controller.js','utf8'),sandbox);
const {categoryState,nextJstEmptyAt}=sandbox.window.FamilytodoGoodsCategoryState;
for(const [time,cutoff] of [['22:59','00:00'],['23:00','01:00'],['23:59','01:00']]){
 const stamp=`2026-09-22T${time}:00+09:00`,expected=Date.parse(`2026-09-23T${cutoff}:00+09:00`);
 assert.equal(nextJstEmptyAt(stamp),expected);assert.equal(categoryState({activated_at:stamp},0,expected-1),'FRESH_EMPTY');assert.equal(categoryState({activated_at:stamp},0,expected),'ARCHIVED_EMPTY');assert.equal(categoryState({activated_at:stamp},1,expected),'ACTIVE');
}
assert.equal(nextJstEmptyAt('2026-09-22 22:59:00'),0,'ambiguous client timestamp rejected');
assert.equal(categoryState({enabled:0},5),'DISABLED');
const db=database(true),ctx=context(db),old='2000-01-02 03:04:05';
for(const kind of ['shopping','item'])db.prepare(`INSERT INTO ${kind}_category_catalog(family_id,name,created_at) VALUES(1,'昔',?)`).run(old);
db.exec(readFileSync('migrations/0101_goods_category_lifecycle.sql','utf8'));
for(const kind of ['shopping','item']){
 const other=kind==='shopping'?'item':'shopping',table=kind==='shopping'?'shopping_items':'items',date=kind==='shopping'?'due_date':'due_at',cat=`${kind}_category_catalog`,op=operations(ctx,kind),peer=operations(ctx,other);
 const read=name=>db.prepare(`SELECT * FROM ${cat} WHERE family_id=1 AND name=?`).get(name);
 assert.equal(read('昔').activated_at,'2000-01-02T03:04:05.000Z');assert.equal(categoryState(read('昔'),0),'ARCHIVED_EMPTY');
 await op.rename('昔','新名称');assert.equal(categoryState(read('新名称'),0),'FRESH_EMPTY');assert.equal((await op.load()).categoryMeta.find(x=>x.name==='新名称').activated_at,read('新名称').activated_at);
 await op.create('同名');await peer.create('同名');const peerBefore=JSON.stringify((await peer.load()).categoryMeta);
 db.exec(`INSERT INTO ${table}(family_id,name,category,created_at,updated_at) VALUES(1,'content','同名','old','old'); INSERT INTO ${cat}(family_id,name) VALUES(2,'同名');`);
 await op.rename('同名','片側');assert.equal(JSON.stringify((await peer.load()).categoryMeta),peerBefore);assert(db.prepare(`SELECT name FROM ${cat} WHERE family_id=2 AND name='同名'`).get());
 assert.equal(db.prepare(`SELECT category FROM ${table} WHERE name='content'`).get().category,'片側');
 await op.remove('片側');assert.equal(db.prepare(`SELECT category FROM ${table} WHERE name='content'`).get().category,null);assert.equal(JSON.stringify((await peer.load()).categoryMeta),peerBefore);
 await op.create('再作成');db.exec(`UPDATE ${cat} SET created_at='2000-01-01',activated_at='2000-01-01T00:00:00Z' WHERE name='再作成'`);await op.remove('再作成');await op.create('再作成');assert.equal(read('再作成').created_at,'2000-01-01');assert.equal(categoryState(read('再作成'),0),'FRESH_EMPTY');
 await op.create('消失');const reset=()=>db.exec(`UPDATE ${cat} SET activated_at='2000-01-01T00:00:00Z' WHERE name='消失'`);
 const insert=(name,day='2026-09-22')=>db.prepare(`INSERT INTO ${table}(family_id,name,category,${date},created_at,updated_at) VALUES(1,?,'消失',?,'old','old')`).run(name,day);
 insert('first');insert('last');reset();db.exec(`DELETE FROM ${table} WHERE name='first'`);assert.equal(read('消失').activated_at,'2000-01-01T00:00:00Z','not final row');
 db.exec(`UPDATE ${table} SET status='completed' WHERE name='last'`);await op.reorder(['消失']);assert.equal(read('消失').activated_at,'2000-01-01T00:00:00Z','completion and order never activate');
 db.exec(`DELETE FROM ${table} WHERE name='last'`);assert.equal(categoryState(read('消失'),0),'FRESH_EMPTY');
 insert('move');reset();db.exec(`UPDATE ${table} SET category='移動先' WHERE name='move'`);assert.equal(categoryState(read('消失'),0),'FRESH_EMPTY');
 insert('date');insert('historical','2020-01-01');reset();db.exec(`UPDATE ${table} SET ${date}='2026-09-23' WHERE name='date'`);assert.equal(categoryState(read('消失'),0),'FRESH_EMPTY','historical rows cannot suppress date-cohort freshness');
 insert('public');insert('private');db.exec(`UPDATE ${table} SET visibility_scope='PRIVATE',private_owner_id=1 WHERE name='private'`);reset();db.exec(`DELETE FROM ${table} WHERE name='public'`);assert.equal(categoryState(read('消失'),0),'FRESH_EMPTY','private row cannot suppress family-visible empty transition');
 await op.create('delete-all');await peer.create('delete-all');db.exec(`INSERT INTO ${table}(family_id,name,category,created_at,updated_at) VALUES(1,'delete-target','delete-all','old','old')`);await op.remove('delete-all','delete');assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE name='delete-target'`).get().n,0);assert((await peer.load()).categories.includes('delete-all'));
 db.exec(`DELETE FROM ${cat} WHERE family_id=2 AND name='同名'`);
}
// Failed item rename must roll back row rename, target creation, old disable AND order.
await operations(ctx,'item').create('atomic');ctx.failSql=/INSERT INTO family_settings/;await assert.rejects(()=>operations(ctx,'item').rename('atomic','broken'));ctx.failSql=null;assert(db.prepare("SELECT 1 FROM item_category_catalog WHERE name='atomic' AND enabled=1").get());assert(!db.prepare("SELECT 1 FROM item_category_catalog WHERE name='broken'").get());
assert.equal((await api(ctx,'/api/shopping-category-mutation',{csrf:'wrong',action:'delete_many',kind:'shopping',names:['消失']})).status,403);
assert.equal((await api(ctx,'/api/shopping-category-mutation',{action:'delete_many',kind:'shared',names:['消失']})).status,400,'retired shared mutations fail closed');
ctx.member.role='MEMBER';assert.equal((await api(ctx,'/api/shopping-category-mutation',{action:'delete_many',kind:'item',names:['消失']})).status,403);
for(const file of ['checklist-hierarchy-followup.js','checklist-category-drag.js','checklist-belongings-categories.js']){
 const source=readFileSync('public/assets/'+file,'utf8');assert(!/category_rename|action:'rename'|action:'delete_many'|mergedCategories|mergedMeta/.test(source),file+' relinquishes category ownership');
}
assert(!readFileSync('public/assets/goods-category-controller.js','utf8').includes("kind:'shared'"));
db.exec('PRAGMA foreign_keys=ON; DELETE FROM families WHERE id=1');
assert.equal(db.prepare('SELECT count(*) n FROM shopping_category_catalog WHERE family_id=1').get().n,0);
db.close();console.log('Goods lifecycle: real migrations/APIs, both kinds, family isolation, rename/recreate/removal/date/privacy/rollback and JST boundaries passed');
