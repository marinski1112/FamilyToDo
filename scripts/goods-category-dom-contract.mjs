import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {database,context,operations,api} from './goods-category-test-support.mjs';
const db=database(),ctx=context(db),requests=[];
await operations(ctx,'item').create('再有効化セット');await operations(ctx,'item').remove('再有効化セット');
for(const kind of ['shopping','item']){
 const op=operations(ctx,kind);for(const name of [kind==='shopping'?'食品':'保育園','同名','古い空'])await op.create(name);
 db.exec(`UPDATE ${kind}_category_catalog SET activated_at='2000-01-01T00:00:00Z' WHERE name='古い空'`);
 const table=kind==='shopping'?'shopping_items':'items',date=kind==='shopping'?'due_date':'due_at';
 db.exec(`INSERT INTO ${table}(family_id,name,category,${date},created_at,updated_at) VALUES(1,'内容','同名','2026-09-22','old','old')`);
}
// Legacy disabled and missing catalogs must never hide surviving content.
for(const kind of ['shopping','item']){
 const op=operations(ctx,kind);await op.create('廃止済み');await op.remove('廃止済み');await op.create('件数');
 const table=kind==='shopping'?'shopping_items':'items',due=kind==='shopping'?'due_date':'due_at';
 for(const category of ['廃止済み','存在しない','件数'])for(const status of ['pending','completed'])db.prepare(`INSERT INTO ${table}(family_id,name,category,${due},status,completed_at,created_at,updated_at) VALUES(1,?,?,'2026-09-22',?,datetime('now','+9 hours'),'old','old')`).run(category+status,category,status);
 db.prepare(`INSERT INTO ${table}(family_id,name,category,${due},status,completed_at,created_at,updated_at) VALUES(1,'追加完了','件数','2026-09-22','completed',datetime('now','+9 hours'),'old','old')`).run();
}
const assets=['task-events.js','checklist-reminders-followup.js','checklist-belongings-categories.js','checklist-controller.js','goods-category-controller.js','checklist-category-drag.js','checklist-category-followup.js','checklist-shopping-inline-entry.js','checklist-add-footer.js','checklist-item-polish.js','checklist-hierarchy-followup.js','checklist-belongings-reusable-sets.js','checklist-shopping-reusable-sets.js'];
const settle=()=>new Promise(resolve=>setTimeout(resolve,90));
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function render(kind='shopping'){
 const w=new Window({url:'https://familytodo.test/app/tasks.php?date=2026-09-22',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 w.sessionStorage.setItem('familytodo.goods.kind',kind);w.alert=message=>{throw Error(message)};w.confirm=()=>true;let reloads=0;w.location.reload=()=>{reloads++};
 w.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;requests.push({url:String(url),body});return api(ctx,String(url),body);};
 const shopping=db.prepare("SELECT * FROM shopping_items WHERE family_id=1").all().map(r=>`<div class="row linked-shopping-row" data-category="${escape(r.category)}"><div class="checklist-row-line"><label class="shopping-check-row"><input class="toggle" type="checkbox" data-type="shopping" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span>${escape(r.name)}</span></label></div><div class="meta"></div></div>`).join('');
 const items=db.prepare("SELECT * FROM items WHERE family_id=1 AND date(due_at)='2026-09-22'").all().map(r=>`<div class="row"><label><input class="toggle" type="checkbox" data-type="item" data-id="${r.id}" ${r.status==='completed'?'checked':''}><span>${escape(r.name)}</span></label><a href="/item/edit.php?id=${r.id}">編集</a></div>`).join('');
 w.document.body.innerHTML=`<script type="application/json" id="dailyPayload">{"csrf":"goods-test","date":"2026-09-22"}</script><div class="checklist-page reminders-ui"><div class="checklist-date">2026.9.22</div><section class="task-section"><div class="section-head"><h2>タスク</h2></div></section><section class="shopping-checklist-section"><div class="section-head"><h2>買い物</h2></div>${shopping}</section><section class="item-section"><div class="section-head"><h2>持ち物</h2></div>${items}</section></div>`;
 for(const asset of assets)w.eval(readFileSync('public/assets/'+asset,'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();await settle();
 const host=w.document.querySelector('.unified-goods-section');assert(host,'controller booted');
 return {w,host,reloads:()=>reloads,close:()=>w.happyDOM.close()};
}
let view=await render();
const find=(view,kind,name)=>[...view.host.querySelectorAll(':scope>.unified-category-group')].find(g=>g.dataset.goodsKind===kind&&g.dataset.category===name);
assert(find(view,'shopping','食品'));assert(!find(view,'item','食品'));assert(find(view,'item','保育園'));assert(!find(view,'shopping','保育園'));
for(const kind of ['shopping','item']){
 view.host.querySelector(`[data-kind="${kind}"]`).click();
 assert.equal(find(view,'item','保育園').hidden,false,'Item categories visible under both input tabs');
 assert.equal(find(view,'shopping','食品').hidden,false,'Shopping categories visible under both input tabs');
 assert.equal(find(view,'item','同名').hidden,false,'same-name Item category remains independent');
 assert.equal(find(view,'shopping','同名').hidden,false,'same-name Shopping category remains independent');
 assert.equal(view.host.querySelector('.task-section .unified-category-group'),null,'Task/Event categories remain separate');
 assert.equal(view.host.querySelector('.unified-goods-category-add').dataset.inputKind,kind,'tabs route category creation only');
 assert.equal(view.host.querySelector('.zero-unclassified-add').textContent,kind==='item'?'＋ 未分類に持ち物を追加':'＋ 未分類に買い物を追加');
}

await settle();assert.equal([...view.host.querySelectorAll('.unified-goods-set-button')].filter(b=>!b.hidden).length,1,'one active set button');
for(const kind of ['shopping','item']){
 view.host.querySelector(`[data-kind="${kind}"]`).click();
 const unc=find(view,kind,'未分類');
 assert.equal(unc.querySelectorAll('input.toggle').length,4,'both pending/completed legacy orphan rows recovered in own kind');
 assert.equal(find(view,kind,'廃止済み').hidden,true);assert.equal(find(view,kind,'存在しない').hidden,true);
 assert.equal(find(view,kind,'件数').querySelector('.checklist-category-count-toggle').textContent,'1','pending count');
 view.host.querySelector('[data-status="completed"]').click();
 assert.equal(find(view,kind,'件数').querySelector('.checklist-category-count-toggle').textContent,'2','completed count');
 assert.equal(unc.querySelector('.checklist-category-count-toggle').textContent,'2','completed orphan count');
 const empty=find(view,kind,'古い空');assert.equal(empty.hidden,false,'zero completed stays a regular category');assert.equal(empty.querySelector('.checklist-category-count-toggle').textContent,'0');assert.equal(view.host.querySelector('.zero-category-cluster').hidden,true);
 view.host.querySelector('[data-status="pending"]').click();assert.equal(empty.hidden,true,'pending lifecycle remains archived');
}
const archiveRows=[...view.host.querySelectorAll('.zero-category-cluster-row')];
assert.equal(archiveRows.length,2,'both kinds share the archived-empty cluster');
assert.deepEqual(archiveRows.map(r=>r.dataset.goodsKind).sort(),['item','shopping']);
for(const kind of ['shopping','item']){
 view.host.querySelector(`[data-kind="${kind}"]`).click();
 assert.deepEqual([...view.host.querySelectorAll('.zero-category-cluster-row')].map(r=>r.dataset.goodsKind).sort(),['item','shopping'],'tabs cannot filter empty categories');
 assert.equal(find(view,'shopping','食品').hidden,false);assert.equal(find(view,'item','保育園').hidden,false);
}
view.host.querySelector('[data-kind="shopping"]').click();
// Rename archived Item category while Shopping is the selected input kind through the real delegated UI/API; reload from DB.
view.host.querySelector('.zero-category-cluster-row[data-goods-kind="item"] .zero-category-name').click();let input=view.host.querySelector('.category-inline-rename');assert(input);input.value='改名した空';input.dispatchEvent(new view.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle();assert.equal(view.reloads(),1);assert.equal(requests.filter(r=>r.body?.action==='category_rename').length,1,'exactly one rename owner');await view.close();
view=await render('item');assert.equal(find(view,'item','改名した空').dataset.categoryState,'FRESH_EMPTY');assert.equal(find(view,'item','改名した空').hidden,false);assert(find(view,'shopping','古い空'),'other kind unchanged');assert.equal(view.host.querySelector('.zero-category-cluster-row').dataset.goodsKind,'shopping','other kind remains in shared empty cluster');
// Same create affordance for both kinds, persisted across reload.
for(const kind of ['shopping','item']){
 view.host.querySelector(`[data-kind="${kind}"]`).click();view.host.querySelector('.unified-goods-category-add').click();await settle();input=view.host.querySelector('.category-inline-rename');assert(input);input.value='追加'+kind;input.dispatchEvent(new view.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle();await view.close();view=await render(kind);assert.equal(find(view,kind,'追加'+kind).dataset.categoryState,'FRESH_EMPTY');assert(!find(view,kind==='shopping'?'item':'shopping','追加'+kind));
}
// Both unclassified composers save content to the selected kind.
for(const kind of ['shopping','item']){
 view.host.querySelector(`[data-kind="${kind}"]`).click();view.host.querySelector('.zero-unclassified-add').click();await settle();const g=find(view,kind,'未分類'),field=g.querySelector(kind==='shopping'?'.shopping-continuous-name':'.belongings-composer-name');assert(field,'working composer, including empty catalog');field.value='未分類テスト'+kind;field.dispatchEvent(new view.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle();const table=kind==='shopping'?'shopping_items':'items';assert(db.prepare(`SELECT 1 FROM ${table} WHERE name=? AND category IS NULL`).get('未分類テスト'+kind));if(kind==='item'){const row=[...g.querySelectorAll('.belongings-category-row')].find(r=>r.querySelector('.item-check-row>span')?.textContent==='未分類テストitem');assert(row?.querySelector(':scope>.checklist-row-line'),'new item uses same full-width line as existing item');assert.equal(row.querySelector('.checklist-row-line').lastElementChild?.className,'belongings-item-info','new item i stays at line end');}
}
// Reusable-set content events reload authoritative metadata, including re-enable.
const addedResponse=await api(ctx,'/api/item',{action:'add',name:'セット追加',category:'再有効化セット',date:'2026-09-22'}),added=await addedResponse.json();
view.w.document.querySelector('.item-section').dispatchEvent(new view.w.CustomEvent('belongings-items-added',{detail:{items:[{id:added.id,name:'セット追加',category:'再有効化セット'}]}}));await settle();assert.equal(find(view,'item','再有効化セット').dataset.categoryState,'ACTIVE');assert.equal(find(view,'item','再有効化セット').hidden,false);
// Same-name deletion never sends shared and never disables the other catalog.
view.host.querySelector('[data-kind="shopping"]').click();view.host.querySelector('.unified-goods-delete-mode').click();assert(find(view,'item','同名').querySelector('.category-delete-minus'),'both kinds can be deleted under either input tab');find(view,'item','同名').querySelector('.category-delete-minus').click();view.w.document.querySelector('[data-policy="unclassified"]').click();await settle();assert.equal(requests.at(-1).body.kind,'item');assert.equal(db.prepare("SELECT enabled FROM shopping_category_catalog WHERE name='同名'").get().enabled,1);assert.equal(db.prepare("SELECT category FROM items WHERE name='内容'").get().category,null);
assert(!requests.some(r=>r.body?.kind==='shared'));assert(find(view,'shopping','同名').hidden===false,'other kind remains visible after deletion');
const source=find(view,'shopping','同名'),target=find(view,'shopping','食品'),row=source.querySelector('.linked-shopping-row'),before=requests.length;
await view.w.familytodoGoodsCategories.moveContent(row,find(view,'item','保育園'));assert.equal(requests.length,before,'cross-kind drag rejected');
await view.w.familytodoGoodsCategories.moveContent(row,target);assert.equal(requests.at(-1).url,'/api/shopping');assert.equal(requests.at(-1).body.category,'食品');
assert.equal(view.w.FamilytodoGoodsCategoryState.categoryState(db.prepare("SELECT * FROM shopping_category_catalog WHERE name='同名'").get(),0),'FRESH_EMPTY');
await view.w.familytodoGoodsCategories.reorderCategories('shopping',['食品','同名']);assert.equal(requests.at(-1).body.action,'reorder');assert.equal(db.prepare("SELECT count(*) n FROM family_settings WHERE setting_key='item_category_order' AND setting_value='[\"食品\",\"同名\"]'").get().n,0);
for(const kind of ['shopping','item']){
 const unc=find(view,kind,'未分類'),openComposer=unc.querySelector('.shopping-continuous-composer,.belongings-composer');if(openComposer&&!openComposer.hidden)unc.querySelector('.shopping-category-add-item')?.click();for(const row of [...unc.querySelectorAll('.linked-shopping-row,.belongings-category-row')])row.remove();
 view.w.familytodoGoodsCategories.refresh();assert.equal(unc.hidden,true,'zero-count unclassified stays hidden');
 view.host.querySelector(`[data-kind="${kind}"]`).click();view.host.querySelector('.zero-unclassified-add').click();await settle();
 assert.equal(unc.hidden,false,'unclassified add still opens an empty category composer');
 assert(unc.querySelector(kind==='shopping'?'.shopping-continuous-name:not([disabled])':'.belongings-composer-name:not([disabled])'));
}
await view.close();db.close();console.log('Goods DOM: Shopping/Item categories and archived cluster co-visible under both add tabs, isolated mutations, hidden zero unclassified, row actions and lifecycle passed');
