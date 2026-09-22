/* Canonical Goods category owner. Content renderers own only rows/composers.
 * Identity is (kind, normalized name); never combine the two catalogs. */
(()=>{
'use strict';
const U='未分類',KINDS=['shopping','item'];
const key=value=>String(value??'').trim().replace(/[A-Z]/g,c=>c.toLowerCase()); // SQLite NOCASE
const nextJstEmptyAt=raw=>{
 const text=String(raw||'');
 if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(text))return 0;
 const at=Date.parse(text);if(!Number.isFinite(at))return 0;
 const jst=new Date(at+9*3600000);
 return Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()+1,jst.getUTCHours()>=23?1:0)-9*3600000;
};
const categoryState=(meta,count,now=Date.now())=>{
 if(meta?.enabled===0)return 'DISABLED';
 if(count>0)return 'ACTIVE';
 const cutoff=nextJstEmptyAt(meta?.activated_at);
 return cutoff>now?'FRESH_EMPTY':'ARCHIVED_EMPTY';
};
// Pure contracts are also executed by the regression suite.
window.FamilytodoGoodsCategoryState={nextJstEmptyAt,categoryState};
const boot=async()=>{
 if(location.pathname!=='/app/tasks.php')return;
 const page=document.querySelector('.checklist-page'),host=page?.querySelector('.shopping-checklist-section'),itemSource=page?.querySelector('.item-section');
 if(!host||!itemSource)return;
 const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
 const request=async(url,body)=>{
  const response=await fetch(url,body?{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),...body})}:{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
  const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'カテゴリの更新に失敗しました。');return data;
 };
 const adapters={
  shopping:{load:()=>request('/api/shopping-categories'),create:name=>request('/api/shopping-categories',{action:'add',name}),rename:(name,new_name)=>request('/api/shopping-category-mutation',{action:'rename',kind:'shopping',name,new_name}),reorder:order=>request('/api/shopping-categories',{action:'reorder',order}),move:(id,category)=>request('/api/shopping',{action:'update_category',id,category})},
  item:{load:()=>request('/api/item?view=categories'),create:name=>request('/api/item',{action:'category_add',name}),rename:(name,new_name)=>request('/api/item',{action:'category_rename',name,new_name}),reorder:order=>request('/api/item',{action:'category_reorder',order}),move:(id,category)=>request('/api/item',{action:'update_category',id,category})},
 };
 const adapter=kind=>{if(!KINDS.includes(kind))throw new Error('カテゴリ種別が不正です。');return adapters[kind];};
 let data;
 try{data=await Promise.all([adapters.shopping.load(),window.familytodoGoodsContent.item.ready]);}
 catch(error){const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent=error.message+' 再読み込みしてください。';host.prepend(notice);return;}
 const catalogs=new Map(KINDS.map((kind,i)=>[kind,new Map((data[i].categoryMeta||[]).map(meta=>[key(meta.name),meta]))]));
 let active='shopping',deleteMode=false;
 try{const saved=sessionStorage.getItem('familytodo.goods.kind');if(KINDS.includes(saved))active=saved;}catch{}
 host.classList.add('unified-goods-section');itemSource.classList.add('unified-items-source');itemSource.hidden=true;
 const head=host.querySelector(':scope>.section-head');head.querySelector('h2')?.classList.add('unified-original-title-hidden');
 const tabs=document.createElement('div');tabs.className='checklist-kind-tabs goods-kind-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','カテゴリ種別');
 tabs.innerHTML='<button type="button" data-kind="shopping" role="tab">🛒 買い物</button><button type="button" data-kind="item" role="tab">🎒 持ち物</button>';
 const tools=document.createElement('div');tools.className='checklist-section-tools';
 const ai=document.createElement('a');ai.className='checklist-compact-action unified-ai-input';ai.textContent='＋AI入力';
 const add=document.createElement('button');add.type='button';add.className='checklist-compact-action unified-goods-category-add';add.textContent='＋ カテゴリ';tools.append(ai,add);head.prepend(tabs);head.append(tools);
 const status=document.createElement('div');status.className='checklist-status-tabs';status.innerHTML='<div class="checklist-status-segments" role="tablist" aria-label="完了状態"><button type="button" data-status="pending" role="tab">未完了</button><button type="button" data-status="completed" role="tab">完了済み</button></div>';
 const trash=document.createElement('button');trash.type='button';trash.className='checklist-icon-button unified-goods-delete-mode';trash.textContent='🗑️';trash.setAttribute('aria-label','カテゴリ削除');status.append(trash);head.after(status);host.dataset.statusTab='pending';
 const zero=document.createElement('details');zero.className='zero-category-cluster unified-goods-zero';zero.innerHTML='<summary><span>空のカテゴリ</span><span></span></summary><div class="zero-category-cluster-list"></div>';host.append(zero);
 const unclassified=document.createElement('button');unclassified.type='button';unclassified.className='zero-unclassified-add';host.append(unclassified);
 const groups=kind=>[...host.querySelectorAll(':scope>[data-goods-kind][data-category]')].filter(g=>g.dataset.goodsKind===kind&&!g.classList.contains('shopping-category-draft'));
 const rows=g=>[...g.querySelectorAll(':scope>.linked-shopping-row,:scope>.belongings-category-body>.belongings-category-row')];
 const name=g=>String(g.dataset.category||U);
 const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
 const openedEmpty=new WeakSet();
 const ensureGroup=(kind,category)=>{
  let g=groups(kind).find(g=>key(name(g))===key(category));if(g)return g;
  if(kind==='item')g=window.familytodoGoodsContent.item.ensureGroup(category);
  else{g=document.createElement('div');g.className='shopping-category-group category-collapsed';g.dataset.category=category;const h=document.createElement('div');h.className='shopping-category-title';g.append(h);}
  g.dataset.goodsKind=kind;zero.before(g);return g;
 };
 const register=g=>{
  const kind=g.dataset.goodsKind;if(!KINDS.includes(kind))return;
  g.classList.add('unified-category-group','unified-shopping-group');if(kind==='item')g.classList.add('unified-item-group');
  if(g.dataset.goodsHeader==='1')return;g.dataset.goodsHeader='1';
  const h=g.querySelector(':scope>.shopping-category-title,:scope>.belongings-category-head');if(!h)return;
  // Replace the old header once: legacy handlers cannot compete with this owner.
  h.replaceChildren();
  const grip=document.createElement('button');grip.type='button';grip.className='cat-grip goods-category-grip';grip.textContent='☰';grip.draggable=true;grip.setAttribute('aria-label',name(g)+'を並び替え');
  const icon=document.createElement('span');icon.className='unified-category-icon';icon.textContent=kind==='shopping'?'🛒':'🎒';icon.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.tabIndex=0;title.setAttribute('role','button');title.className='shopping-category-name category-name-editable'+(kind==='item'?' belongings-category-name':'');title.textContent=name(g);title.dataset.goodsAction='rename';if(name(g)===U){title.removeAttribute('role');title.tabIndex=-1;}title.title='カテゴリ名を編集';
  const count=document.createElement('button');count.type='button';count.className='checklist-category-count-toggle';count.dataset.goodsAction='toggle';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='shopping-category-toggle'+(kind==='item'?' belongings-category-toggle':'');toggle.dataset.goodsAction='toggle';
  h.append(grip,icon,title,count,toggle);if(name(g)===U)grip.hidden=true;
 };
 for(const g of host.querySelectorAll(':scope>.shopping-category-group:not(.belongings-category-group)'))g.dataset.goodsKind='shopping';
 for(const g of itemSource.querySelectorAll(':scope>.belongings-category-group')){g.dataset.goodsKind='item';zero.before(g);}
 for(const [i,kind] of KINDS.entries()){
  for(const category of data[i].categories||[])ensureGroup(kind,category);
  ensureGroup(kind,U);
  const all=groups(kind),byName=new Map(all.map(g=>[key(name(g)),g]));
  for(const category of data[i].order||[]){const g=byName.get(key(category));if(g){zero.before(g);byName.delete(key(category));}}
  for(const g of byName.values())zero.before(g);
 }
 const refresh=()=>{
  let completed=0;const archived=[];
  for(const kind of KINDS)for(const g of groups(kind)){
   register(g);const content=rows(g),meta=catalogs.get(kind).get(key(name(g))),state=categoryState(meta,content.length);
   g.dataset.categoryState=state;g.dataset.activatedAt=meta?.activated_at||'';
   g.classList.toggle('category-new-empty',state==='FRESH_EMPTY');g.classList.remove('checklist-status-group-empty');
   g.hidden=kind!==active||state==='DISABLED'||(name(g)!==U&&state==='ARCHIVED_EMPTY'&&!openedEmpty.has(g));
   const collapsed=g.classList.contains('category-collapsed'),h=g.querySelector(':scope>.shopping-category-title');
   const count=h?.querySelector('.checklist-category-count-toggle'),toggle=h?.querySelector('.shopping-category-toggle');setText(count,String(content.length));setText(toggle,collapsed?'›':'⌄');
   toggle?.setAttribute('aria-expanded',String(!collapsed));toggle?.setAttribute('aria-label',`${name(g)}を${collapsed?'展開':'閉じる'}`);count?.setAttribute('aria-label',`${name(g)} ${content.length}件を開閉`);
   for(const row of content){const done=Boolean(row.querySelector('input.toggle')?.checked);if(kind===active&&done)completed++;row.classList.toggle('checklist-status-hidden',host.dataset.statusTab==='completed'?!done:done);}
   const minus=h?.querySelector('.category-delete-minus');if(deleteMode&&kind===active&&name(g)!==U){if(!minus){const b=document.createElement('button');b.type='button';b.className='category-delete-minus';b.dataset.goodsAction='delete';b.textContent='−';b.setAttribute('aria-label',name(g)+'を削除');h.prepend(b);}}else minus?.remove();
   if(kind===active&&name(g)!==U&&state==='ARCHIVED_EMPTY')archived.push(g);
  }
  status.querySelectorAll('[data-status]').forEach(b=>{const on=b.dataset.status===host.dataset.statusTab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
  setText(status.querySelector('[data-status="completed"]'),completed?`完了済み ${completed}`:'完了済み');
  const signature=JSON.stringify([active,deleteMode,archived.map(g=>name(g))]);
  if(zero.dataset.signature!==signature){zero.dataset.signature=signature;const list=zero.querySelector('.zero-category-cluster-list');list.replaceChildren();for(const g of archived){const row=document.createElement('div');row.className='zero-category-cluster-row';row.dataset.goodsKind=g.dataset.goodsKind;row.dataset.category=name(g);row.dataset.categoryState='ARCHIVED_EMPTY';const icon=document.createElement('span');icon.textContent=active==='shopping'?'🛒':'🎒';const title=document.createElement('span');title.tabIndex=0;title.setAttribute('role','button');title.className='zero-category-name';title.dataset.goodsAction='rename';title.textContent=name(g);const plus=document.createElement('button');plus.type='button';plus.className='zero-category-add-item';plus.dataset.goodsAction='compose';plus.textContent='＋ 追加';row.append(icon,title,plus);if(deleteMode){const minus=document.createElement('button');minus.type='button';minus.className='category-delete-minus';minus.dataset.goodsAction='delete';minus.textContent='−';minus.setAttribute('aria-label',name(g)+'を削除');row.prepend(minus)}list.append(row)}}
  zero.hidden=!archived.length;setText(zero.querySelector('summary span:last-child'),String(archived.length));
 };
 const reload=()=>location.reload();
 const run=async operation=>{try{await operation();}catch(error){alert(error.message||String(error));}};
 const editName=(kind,oldName,node)=>{
  if(node.querySelector('input'))return;
  const original=node.textContent,input=document.createElement('input');input.className='category-inline-rename';input.maxLength=255;input.value=oldName||'';input.setAttribute('aria-label',oldName?'カテゴリ名を編集':'新しいカテゴリ名');node.replaceChildren(input);input.focus();input.select();let busy=false;
  const finish=async save=>{if(busy)return;const next=input.value.trim();if(!save){if(oldName)node.textContent=original;else node.closest('.shopping-category-draft')?.remove();return;}if(!next||next===U){input.focus();return;}if(oldName&&key(next)===key(oldName)){node.textContent=original;return;}busy=true;input.disabled=true;try{if(oldName)await adapter(kind).rename(oldName,next);else await adapter(kind).create(next);reload();}catch(error){busy=false;input.disabled=false;alert(error.message||String(error));input.focus();}};
  input.addEventListener('click',e=>e.stopPropagation());input.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();void finish(true)}if(e.key==='Escape'){e.preventDefault();void finish(false)}});input.addEventListener('blur',()=>{if(input.isConnected&&input.value.trim())void finish(true)});
 };
 const choosePolicy=category=>new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='checklist-dialog-backdrop';overlay.innerHTML='<div class="checklist-dialog" role="dialog" aria-modal="true"><h2></h2><p>他の日の項目も対象です。同名の別種別カテゴリは変更しません。</p><button data-policy="unclassified">中の項目を未分類に移動して削除</button><button data-policy="delete" class="danger">カテゴリと中の項目をすべて削除</button><button data-policy="" class="cancel">キャンセル</button></div>';overlay.querySelector('h2').textContent=`「${category}」カテゴリを削除しますか？`;document.body.append(overlay);const done=value=>{overlay.remove();resolve(value)};overlay.addEventListener('click',e=>{const b=e.target.closest('[data-policy]');if(b)done(b.dataset.policy);else if(e.target===overlay)done('')});overlay.addEventListener('keydown',e=>{if(e.key==='Escape')done('')});overlay.querySelector('button').focus();
 });
 const compose=async g=>{openedEmpty.add(g);g.classList.remove('category-collapsed');refresh();for(let i=0;i<4&&!g.querySelector('.shopping-category-add-item');i++)await new Promise(requestAnimationFrame);g.querySelector('.shopping-category-add-item')?.click();g.scrollIntoView({block:'nearest'});};
 host.addEventListener('keydown',e=>{if(e.target.matches('[role=button][data-goods-action]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}});
 host.addEventListener('click',e=>{
  const action=e.target.closest('[data-goods-action]');if(!action)return;const row=action.closest('[data-goods-kind][data-category]');if(!row)return;const kind=row.dataset.goodsKind,category=row.dataset.category,g=groups(kind).find(g=>key(name(g))===key(category));if(!g)return;
  if(action.dataset.goodsAction==='toggle'){g.classList.toggle('category-collapsed');refresh();}
  if(action.dataset.goodsAction==='rename'&&category!==U&&!deleteMode)editName(kind,category,action);
  if(action.dataset.goodsAction==='compose')void compose(g);
  if(action.dataset.goodsAction==='delete')void run(async()=>{const policy=await choosePolicy(category);if(policy){await request('/api/shopping-category-mutation',{action:'delete_many',kind,names:[category],item_policy:policy});reload();}});
 });
 add.addEventListener('click',()=>{
  const existing=host.querySelector('.shopping-category-draft');if(existing){existing.querySelector('input')?.focus();return;}
  const draft=document.createElement('div');draft.className='shopping-category-group shopping-category-draft';draft.dataset.goodsKind=active;draft.dataset.category='__draft__';const field=document.createElement('div');field.className='shopping-category-title';draft.append(field);zero.before(draft);editName(active,null,field);
 });
 const applyKind=kind=>{adapter(kind);active=kind;deleteMode=false;host.classList.remove('category-delete-mode-active');trash.textContent='🗑️';trash.classList.remove('text-button');host.dataset.inputKind=kind;add.dataset.inputKind=kind;try{sessionStorage.setItem('familytodo.goods.kind',kind)}catch{}tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.kind===kind);b.setAttribute('aria-selected',String(b.dataset.kind===kind));});ai.href='/task/new.php?date='+encodeURIComponent(String(payload.date||''))+'&type='+kind;unclassified.textContent=kind==='shopping'?'＋ 未分類に買い物を追加':'＋ 未分類に持ち物を追加';trash.hidden=!data[KINDS.indexOf(kind)].canManageCategories;host.querySelector('.shopping-category-draft')?.remove();refresh();};
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(b)applyKind(b.dataset.kind)});
 trash.addEventListener('click',()=>{deleteMode=!deleteMode;host.classList.toggle('category-delete-mode-active',deleteMode);trash.textContent=deleteMode?'✕':'🗑️';trash.classList.toggle('text-button',deleteMode);trash.setAttribute('aria-label',deleteMode?'削除モードを終了':'カテゴリ削除');if(deleteMode)zero.open=true;refresh();});
 status.addEventListener('click',e=>{const b=e.target.closest('[data-status]');if(b){host.dataset.statusTab=b.dataset.status;refresh();}});
 unclassified.addEventListener('click',()=>void compose(ensureGroup(active,U)));
 window.familytodoGoodsCategories={
  async reorderCategories(kind,order){await adapter(kind).reorder(order)},
  async moveContent(row,target){const source=row.closest('[data-goods-kind][data-category]'),kind=source?.dataset.goodsKind;if(!source||source===target||kind!==target.dataset.goodsKind)return;const id=Number(row.querySelector('input.toggle')?.dataset.id);if(!id)return;await adapter(kind).move(id,name(target)===U?'':name(target));reload();},
  setExpanded(g,expanded){g.classList.toggle('category-collapsed',!expanded);refresh();},
  refresh,
 };
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh();})};
 new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
 itemSource.addEventListener('belongings-items-added',()=>void run(async()=>{const fresh=await adapter('item').load();catalogs.set('item',new Map((fresh.categoryMeta||[]).map(meta=>[key(meta.name),meta])));for(const category of fresh.categories||[])ensureGroup('item',category);refresh();}));
 page.addEventListener('familytodo:toggle-success',schedule);page.addEventListener('change',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,30000);
 applyKind(active);document.dispatchEvent(new CustomEvent('familytodo:checklist-unified-ready'));
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
})();
