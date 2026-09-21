(()=>{'use strict';
const boot=()=>{
  if(location.pathname!=='/app/tasks.php')return;
  const page=document.querySelector('.checklist-page'),section=page?.querySelector('.item-section');
  if(!(page instanceof HTMLElement)||!(section instanceof HTMLElement))return;
  const payload=(()=>{try{return JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}')}catch{return {}}})();
  const date=(()=>{const q=new URLSearchParams(location.search).get('date');if(/^\d{4}-\d{2}-\d{2}$/.test(String(q||'')))return String(q);const m=String(page.querySelector('.checklist-date')?.textContent||'').match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())})();
  const uuid=()=>crypto.randomUUID?.()||`set-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const post=async body=>{const r=await fetch('/api/item',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),...body})}),d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));if(!r.ok||!d.ok){const e=new Error(d.error||'更新に失敗しました。');e.code=String(d.code||'');throw e}return d};
  let overlay=null,list=null,status=null,sourceSelect=null,saveButton=null,editor=null,sets=[];
  const setStatus=(message,error=false)=>{if(!(status instanceof HTMLElement))return;status.textContent=message||'';status.dataset.error=error?'1':'0'};
  const hideEditor=()=>{if(editor instanceof HTMLElement){editor.hidden=true;editor.replaceChildren()}};
  const close=()=>{if(overlay instanceof HTMLElement){overlay.hidden=true;hideEditor();setStatus('')}};
  const groups=()=>[...document.querySelectorAll('.unified-goods-section .unified-item-group,.item-section .belongings-category-group')].filter((g,i,a)=>g instanceof HTMLElement&&a.indexOf(g)===i);
  const categoryName=g=>String(g?.dataset?.category||'').trim()||'未分類';
  const refreshSourceOptions=()=>{
    if(!(sourceSelect instanceof HTMLSelectElement))return;
    const previous=sourceSelect.value,open=groups().find(g=>!g.classList.contains('category-collapsed'));
    sourceSelect.replaceChildren();
    const all=document.createElement('option');all.value='';all.textContent='表示中すべて';sourceSelect.append(all);
    for(const g of groups()){const option=document.createElement('option');option.value=categoryName(g);option.textContent=categoryName(g);sourceSelect.append(option)}
    const choices=[...sourceSelect.options].map(o=>o.value);
    sourceSelect.value=choices.includes(previous)?previous:(open?categoryName(open):'');
    if(saveButton instanceof HTMLButtonElement)saveButton.textContent=sourceSelect.value?`「${sourceSelect.value}」からセット保存`:'表示中すべてからセット保存';
  };
  const sourceIds=category=>{
    const root=category?groups().find(g=>categoryName(g)===category):section;
    if(!(root instanceof HTMLElement))return [];
    const out=[],seen=new Set();
    for(const box of root.querySelectorAll('.belongings-category-row input.toggle[data-type="item"][data-id]')){const id=Number(box.dataset.id||0);if(id>0&&!seen.has(id)){seen.add(id);out.push(id)}}
    return out;
  };
  const makeEditorEntry=(entry={})=>{
    const row=document.createElement('div');row.className='belongings-set-editor-entry';
    const main=document.createElement('div');main.className='belongings-set-editor-main';
    const name=document.createElement('input');name.type='text';name.maxLength=200;name.className='belongings-set-editor-name';name.placeholder='持ち物名';name.value=String(entry.name||'');
    const remove=document.createElement('button');remove.type='button';remove.className='belongings-set-editor-remove';remove.textContent='削除';remove.addEventListener('click',()=>row.remove());
    main.append(name,remove);
    const details=document.createElement('div');details.className='belongings-set-editor-details';
    const memo=document.createElement('textarea');memo.className='belongings-set-editor-memo';memo.rows=2;memo.maxLength=2000;memo.placeholder='メモ';memo.value=String(entry.memo||'');
    const url=document.createElement('input');url.className='belongings-set-editor-url';url.type='url';url.maxLength=2048;url.inputMode='url';url.placeholder='URL';url.value=String(entry.url||'');
    const category=document.createElement('input');category.className='belongings-set-editor-category';category.type='text';category.maxLength=255;category.placeholder='カテゴリ（未分類は空欄可）';category.value=String(entry.category||'');
    details.append(memo,url,category);row.append(main,details);return row;
  };
  const openEditor=set=>{
    if(!(editor instanceof HTMLElement))return;
    editor.replaceChildren();editor.hidden=false;
    const form=document.createElement('form');form.className='belongings-set-editor-form';
    const title=document.createElement('strong');title.className='belongings-set-editor-title';title.textContent='セットを編集';
    const name=document.createElement('input');name.type='text';name.maxLength=120;name.className='belongings-set-editor-set-name';name.value=String(set.name||'');name.placeholder='セット名';
    const entries=document.createElement('div');entries.className='belongings-set-editor-entries';
    for(const item of Array.isArray(set.entries)?set.entries:[])entries.append(makeEditorEntry(item));
    const addEntry=document.createElement('button');addEntry.type='button';addEntry.className='belongings-set-editor-add';addEntry.textContent='＋ 項目を追加';addEntry.addEventListener('click',()=>entries.append(makeEditorEntry()));
    const actions=document.createElement('div');actions.className='belongings-set-editor-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='belongings-set-editor-cancel';cancel.textContent='キャンセル';cancel.addEventListener('click',hideEditor);
    const save=document.createElement('button');save.type='submit';save.className='belongings-set-editor-save';save.textContent='保存';
    actions.append(cancel,save);form.append(title,name,entries,addEntry,actions);editor.append(form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const setName=String(name.value||'').trim();
      const values=[...entries.querySelectorAll('.belongings-set-editor-entry')].map(row=>({
        name:String(row.querySelector('.belongings-set-editor-name')?.value||'').trim(),
        memo:String(row.querySelector('.belongings-set-editor-memo')?.value||'').trim(),
        url:String(row.querySelector('.belongings-set-editor-url')?.value||'').trim(),
        category:String(row.querySelector('.belongings-set-editor-category')?.value||'').trim(),
      }));
      if(!setName){setStatus('セット名を入力してください。',true);name.focus();return}
      if(!values.length){setStatus('セットには1件以上の持ち物が必要です。',true);return}
      const missing=values.findIndex(value=>!value.name);if(missing>=0){setStatus('持ち物名を入力してください。',true);entries.querySelectorAll('.belongings-set-editor-name')[missing]?.focus();return}
      save.disabled=true;setStatus('更新中…');
      try{await post({action:'reusable_set_update',set_id:Number(set.id),name:setName,entries:values});hideEditor();await load();setStatus('セットを更新しました。')}catch(error){setStatus(error?.message||String(error)||'セットを更新できませんでした。',true)}finally{save.disabled=false}
    });
    requestAnimationFrame(()=>name.focus({preventScroll:true}));
  };
  const render=()=>{
    if(!(list instanceof HTMLElement))return;
    list.replaceChildren();
    if(!sets.length){const empty=document.createElement('p');empty.className='belongings-set-empty';empty.textContent='保存済みセットはありません。';list.append(empty);return}
    for(const set of sets){
      const row=document.createElement('div');row.className='belongings-set-row';
      const meta=document.createElement('div');meta.className='belongings-set-meta';const name=document.createElement('strong');name.textContent=String(set.name||'');const count=document.createElement('span');count.textContent=`${Number(set.item_count||0)}件`;meta.append(name,count);
      const actions=document.createElement('div');actions.className='belongings-set-actions';
      const add=document.createElement('button');add.type='button';add.className='belongings-set-add';add.textContent='この日に配置';add.addEventListener('click',()=>void invoke(set,add));actions.append(add);
      if(set.can_edit){const edit=document.createElement('button');edit.type='button';edit.className='belongings-set-edit';edit.textContent='編集';edit.addEventListener('click',()=>openEditor(set));actions.append(edit)}
      if(set.can_delete){const del=document.createElement('button');del.type='button';del.className='belongings-set-delete';del.textContent='削除';del.addEventListener('click',()=>void removeSet(set,del));actions.append(del)}
      row.append(meta,actions);list.append(row);
    }
  };
  const load=async()=>{setStatus('読み込み中…');try{const r=await fetch('/api/item?view=reusable_sets',{credentials:'same-origin',headers:{accept:'application/json'}}),d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));if(!r.ok||!d.ok)throw new Error(d.error||'セットを読み込めませんでした。');sets=Array.isArray(d.sets)?d.sets:[];render();setStatus('')}catch(e){setStatus(e?.message||String(e)||'セットを読み込めませんでした。',true)}};
  const saveCurrent=async button=>{
    const category=sourceSelect instanceof HTMLSelectElement?sourceSelect.value:'';
    const ids=sourceIds(category);if(!ids.length){setStatus(category?`「${category}」に保存できる持ち物がありません。`:'保存できる持ち物がありません。',true);return}
    const raw=prompt('セット名（例：幼稚園セット）',category&&category!=='未分類'?`${category}セット`:'');if(raw===null)return;const name=String(raw).trim();if(!name)return;
    button.disabled=true;setStatus('保存中…');
    try{const d=await post({action:'reusable_set_create',name,source_item_ids:ids});await load();setStatus(Number(d.skipped_private||0)>0?`保存しました。非公開タスクの持ち物 ${Number(d.skipped_private)}件はセットから除外しました。`:'保存しました。')}catch(e){setStatus(e?.message||String(e)||'セットを保存できませんでした。',true)}finally{button.disabled=false}
  };
  const requestKey=id=>`familytodo.item-set-invoke:${date}:${Number(id)}`;
  const requestId=id=>{try{const key=requestKey(id),existing=sessionStorage.getItem(key);if(existing)return existing;const created=uuid();sessionStorage.setItem(key,created);return created}catch{return uuid()}};
  const clearRequest=id=>{try{sessionStorage.removeItem(requestKey(id))}catch{}};
  const invoke=async(set,button)=>{button.disabled=true;setStatus(`${String(set.name||'セット')}を追加中…`);const rid=requestId(set.id);try{const d=await post({action:'reusable_set_invoke',set_id:Number(set.id),date,client_request_id:rid}),items=Array.isArray(d.items)?d.items:[];clearRequest(set.id);section.dispatchEvent(new CustomEvent('belongings-items-added',{detail:{items}}));setStatus(`${String(set.name||'セット')}を${items.length}件追加しました。`)}catch(e){setStatus(e?.message||String(e)||'セットを追加できませんでした。',true)}finally{button.disabled=false}};
  const removeSet=async(set,button)=>{if(!confirm(`「${String(set.name||'セット')}」を削除しますか？\nすでに追加済みの持ち物は削除されません。`))return;button.disabled=true;setStatus('削除中…');try{await post({action:'reusable_set_delete',set_id:Number(set.id)});sets=sets.filter(row=>Number(row.id)!==Number(set.id));hideEditor();render();setStatus('セットを削除しました。')}catch(e){setStatus(e?.message||String(e)||'セットを削除できませんでした。',true)}finally{button.disabled=false}};
  const build=toolbar=>{
    if(document.getElementById('belongingsReusableSetButton'))return;
    const open=document.createElement('button');open.id='belongingsReusableSetButton';open.className='belongings-reusable-set-button unified-goods-set-button';open.type='button';open.textContent='セット';open.setAttribute('aria-label','現在の持ち物からセット保存・呼び出し');const unifiedStatus=document.querySelector('.unified-goods-section>.checklist-status-tabs');if(unifiedStatus instanceof HTMLElement){const trash=unifiedStatus.querySelector('.unified-goods-delete-mode,.category-delete-mode');unifiedStatus.insertBefore(open,trash||null);open.hidden=document.querySelector('.unified-goods-section')?.dataset.inputKind!=='item';document.querySelector('.goods-kind-tabs')?.addEventListener('click',e=>{const b=e.target.closest?.('button[data-kind]');if(b)open.hidden=b.dataset.kind!=='item';});}else toolbar.prepend(open);
    overlay=document.createElement('div');overlay.className='belongings-set-overlay';overlay.hidden=true;
    overlay.innerHTML='<div class="belongings-set-backdrop"></div><section class="belongings-set-sheet" role="dialog" aria-modal="true" aria-labelledby="belongingsSetTitle"><div class="belongings-set-head"><strong id="belongingsSetTitle">持ち物セット</strong><button class="belongings-set-close" type="button" aria-label="閉じる">×</button></div><p class="belongings-set-note">持ち物をセットに保存し、必要な日にまとめて配置できます。</p><div class="belongings-set-save-row"><select class="belongings-set-source" aria-label="セット保存元"></select><button class="belongings-set-save-current" type="button">セット保存</button></div><div class="belongings-set-list"></div><div class="belongings-set-editor" hidden></div><div class="belongings-set-status" role="status" aria-live="polite"></div></section>';
    document.body.append(overlay);list=overlay.querySelector('.belongings-set-list');status=overlay.querySelector('.belongings-set-status');sourceSelect=overlay.querySelector('.belongings-set-source');saveButton=overlay.querySelector('.belongings-set-save-current');editor=overlay.querySelector('.belongings-set-editor');
    open.addEventListener('click',()=>{overlay.hidden=false;hideEditor();refreshSourceOptions();void load()});overlay.querySelector('.belongings-set-close')?.addEventListener('click',close);overlay.querySelector('.belongings-set-backdrop')?.addEventListener('click',close);
    sourceSelect?.addEventListener('change',refreshSourceOptions);saveButton?.addEventListener('click',()=>void saveCurrent(saveButton));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay instanceof HTMLElement&&!overlay.hidden)close()});
  };
  let tries=0;const attach=()=>{const unifiedStatus=document.querySelector('.unified-goods-section>.checklist-status-tabs'),toolbar=section.querySelector('.belongings-category-toolbar');if(unifiedStatus instanceof HTMLElement){build(unifiedStatus);return}if(toolbar instanceof HTMLElement&&tries>=100){build(toolbar);return}if(++tries<200)setTimeout(attach,50)};attach();document.addEventListener('familytodo:checklist-unified-ready',attach,{once:true});
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();