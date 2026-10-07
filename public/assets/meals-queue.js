(()=>{
'use strict';
window.FamilyTodoMealQueue={create({root,paint,api,action,say,esc,getData,reload,leaveForm,cookRecipe,hotcookModel}){
 const amount=n=>n.quantity===null?esc(n.quantity_text):`${n.quantity}${esc(n.unit)}`;
 const update=async(render=show)=>{await reload();render();};
 const formOptions=(selected)=>{const recipes=getData().recipes.slice();if(selected&&!recipes.some(r=>r.id===selected.id))recipes.push(selected);return '<option value="">レシピなし</option>'+recipes.map(r=>`<option value="${esc(r.id)}"${selected?.id===r.id?' selected':''}>${esc(r.name)}</option>`).join('');};
 const links=r=>r.recipe?`<p class="meal-wish-recipe">📖 ${esc(r.recipe.name)}${hotcookModel(r.recipe.source_url)?' · ホットクック '+esc(hotcookModel(r.recipe.source_url)):''}</p>`:'<p class="meal-fine">レシピなし · 買い物：'+esc(r.shopping_text)+'</p>';
 function show(){
  const q=getData().queue||{items:[],history:[],rejected:[],pending_shopping:[]};
  paint(`<section class="card"><div class="page-head"><h2>今回作るもの</h2><a class="btn gray" href="/app/meals.php?view=wishlist">食べたいものから選ぶ</a></div><p class="meal-fine">次の買い物までに作るもの。日付やレシピを決めずに採用できます。買い物が済んでも未調理のものは残ります。</p>${q.pending_shopping.map(j=>`<p>買い物への追加を再確認できます。<button class="btn gray small" data-queue-resume="${esc(j.id)}">追加を再試行</button></p>`).join('')}<div class="meal-list">${q.items.map(r=>`<div class="meal-row"><div><h3 class="meal-title">${esc(r.name)}</h3>${links(r)}${r.recipe?`<p class="meal-fine">${r.servings}人分</p>`:''}${r.shopping_job_id?'<p class="meal-fine">買い物への追加を確認済み（選択分）。変更は買い物リストで調整できます。</p>':''}</div><div class="meal-queue-actions"><button class="btn small" data-queue-cook="${esc(r.id)}">${r.recipe?'調理':'完了'}</button><details class="meal-wish-actions"><summary aria-label="${esc(r.name)}の操作">⋯</summary><div class="meal-wish-menu"><button class="btn gray small" data-queue-edit="${esc(r.id)}">レシピ・買うものを変更</button><button class="btn gray small" data-queue-return="${esc(r.id)}">食べたいものに戻す</button></div></details></div></div>`).join('')||'<p>食べたいものの「採用」から、今回作るものを選んでください。</p>'}</div>${q.items.some(r=>!r.shopping_job_id)?'<div class="actions"><button id="queueShopping">買うものをまとめて確認</button></div>':''}<p><a href="/app/tasks.php#shopping-checklist">買い物リスト</a> · <a href="/app/meals.php?view=week">日付を決める献立</a></p></section><section class="card"><details><summary>料理・取り消しの履歴（最近50件）</summary>${q.history.map(r=>`<p>${esc(r.name)} · ${r.status==='COOKED'?'料理完了':'候補に戻した'} · ${esc((r.completed_at||r.updated_at).slice(0,10))}</p>`).join('')||'<p>まだ履歴はありません。</p>'}</details></section>`);
  const row=id=>q.items.find(r=>r.id===id);
  root.querySelectorAll('[data-queue-cook]').forEach(b=>b.onclick=()=>cooking(row(b.dataset.queueCook)));
  root.querySelectorAll('[data-queue-edit]').forEach(b=>b.onclick=()=>edit(row(b.dataset.queueEdit)));
  root.querySelectorAll('[data-queue-return]').forEach(b=>b.onclick=()=>{const r=row(b.dataset.queueReturn);if(!confirm('食べたいものへ戻しますか？追加済みの買い物は残ります。'))return;action(async()=>{await api({action:'queue_return',id:r.id,revision:r.revision});await update();say('食べたいものに戻しました。');});});
  root.querySelectorAll('[data-queue-resume]').forEach(b=>b.onclick=()=>action(async()=>{await api({action:'queue_shopping_resume',request_id:b.dataset.queueResume});await update();say('買い物への追加を確認しました。');}));
  const shopping=root.querySelector('#queueShopping');if(shopping)shopping.onclick=()=>action(async()=>shoppingReview(await api(null,'?view=queue_shopping_preview')));
 }
 function adopt(w){
  const request=crypto.randomUUID(),recipe=w.recipe_available?getData().recipes.find(r=>r.id===w.linked_recipe_id):null;
  paint(`<section class="card"><h2>今回作るものに採用</h2><h3>${esc(w.name)}</h3><form id="queueAdoptForm">${w.recipe_available?`<p>📖 ${esc(w.recipe_name||recipe?.name||'紐づけ済みレシピ')}</p><label>人数<input type="number" name="servings" min="1" max="30" required value="${recipe?.servings||2}"></label>`:`<label>買い物に追加する内容<input name="shopping_text" maxlength="120" required value="${esc(w.name)}" placeholder="魚（安いものがあれば）"></label><p class="meal-fine">具体的な料理名・分量は不要です。買い物への追加は採用後に確認できます。</p>`}<div class="actions"><button>採用</button><button type="button" id="queueCancel" class="btn gray">戻る</button></div></form></section>`);
  root.querySelector('#queueCancel').onclick=()=>leaveForm(()=>location.href='/app/meals.php?view=wishlist');
  root.querySelector('#queueAdoptForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);action(async()=>{await api({action:'wish_adopt',request_id:request,id:w.id,expected_revision:w.recipe_link_revision||0,servings:Number(f.get('servings')||2),shopping_text:f.get('shopping_text')||w.name});await update();say('今回作るものに採用しました。買うものはまとめて確認できます。');});};
 }
 function edit(r){
  paint(`<section class="card"><h2>${esc(r.name)}</h2><form id="queueEditForm"><label>レシピ<select name="recipe_id">${formOptions(r.recipe)}</select></label><label>人数<input name="servings" type="number" min="1" max="30" required value="${r.servings}"></label><label>レシピなしの場合の買うもの<input name="shopping_text" maxlength="120" value="${esc(r.shopping_text||r.name)}"></label>${r.shopping_job_id?'<p class="meal-fine">追加済みの買い物は変更しません。食材の変更分は買い物リストで調整してください。</p>':''}<div class="actions"><button>保存</button><button type="button" id="queueCancel" class="btn gray">戻る</button></div></form></section>`);
  root.querySelector('#queueCancel').onclick=()=>leaveForm(show);
  root.querySelector('#queueEditForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);action(async()=>{await api({action:'queue_edit',id:r.id,revision:r.revision,recipe_id:f.get('recipe_id')||null,servings:Number(f.get('servings')),shopping_text:f.get('shopping_text')});await update();say('今回作るものを更新しました。');});};
 }
 function shoppingReview(p){
  const request=crypto.randomUUID();
  paint(`<section class="card"><h2>買うものをまとめて確認</h2><p class="meal-fine">未追加の料理の食材をまとめ、正確な在庫を差し引きます。漠然とした希望はそのまま追加します。選ばなかった食材は買い物リストで後から追加できます。</p><form id="queueShoppingForm">${p.needs.map((n,i)=>`<label class="meal-check"><input type="checkbox" name="selected" value="${i}"${n.quantity===null||n.quantity>0?' checked':' disabled'}><span>${esc(n.name)} · ${amount(n)}${n.quantity===0?'（在庫あり）':''}</span></label>`).join('')||'<p>不足する食材はありません。</p>'}<div class="actions">${p.needs.some(n=>n.quantity===null||n.quantity>0)?'<button>選択分を買い物に追加</button>':''}<button type="button" id="queueCancel" class="btn gray">戻る</button></div></form></section>`);
  root.querySelector('#queueCancel').onclick=()=>leaveForm(show);
  root.querySelector('#queueShoppingForm').onsubmit=e=>{e.preventDefault();const selected=new FormData(e.target).getAll('selected').map(Number);if(!selected.length){say('追加するものを選んでください。',true);return;}action(async()=>{await api({action:'queue_shopping_confirm',request_id:request,preview_hash:p.preview_hash,selected});await update();say('選択したものを買い物リストに追加しました。');});};
 }
 function completion(r){action(async()=>{const {preview:p}=await api(null,'?view=queue_cooking_preview&id='+encodeURIComponent(r.id));paint(`<section class="card"><h2>${esc(r.name)} · 料理完了</h2><p>完了すると「今回作るもの」から外れ、履歴に残ります。</p>${p.allocations.map(a=>`<p>${esc(a.name)} · ${a.quantity}${esc(a.unit)}</p>`).join('')||'<p>差し引く正確な在庫はありません。</p>'}<form id="queueCompleteForm">${p.allocations.length?'<label class="meal-check"><input type="checkbox" name="consume"><span>表示した数量を在庫から差し引く</span></label>':''}<div class="actions"><button>料理完了</button><button type="button" id="queueCancel" class="btn gray">戻る</button></div></form></section>`);root.querySelector('#queueCancel').onclick=()=>leaveForm(()=>cooking(r));root.querySelector('#queueCompleteForm').onsubmit=e=>{e.preventDefault();const consume=new FormData(e.target).has('consume');action(async()=>{await api({action:'queue_cooked',id:r.id,revision:r.revision,consume_inventory:consume,preview_hash:p.preview_hash});await update();say('料理完了として記録しました。');});};});}
 function cooking(r){if(!r.recipe)completion(r);else cookRecipe(r);}

 return {show,adopt};
}};
})();
