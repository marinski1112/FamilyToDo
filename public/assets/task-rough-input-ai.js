(() => {
'use strict';
try{
  const form=document.getElementById('taskForm'),button=document.getElementById('roughPreviewButton'),preview=document.getElementById('roughPreview');
  if(!form||!button||!preview)return;
  const fallbackPreview=button.onclick;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const label=v=>({task:'タスク',event:'イベント',shopping:'買い物',item:'持ち物',child_task:'子タスク'}[v]||v);
  const fieldList=()=>{
    const mode=primary(),out=[{destination:mode,element:document.getElementById('roughMainInput')}];
    if(mode==='task'||mode==='event'){
      if(document.getElementById('roughAllowChildTask')?.checked)out.push({destination:'child_task',element:document.getElementById('roughChildTaskInput')});
      if(document.getElementById('roughAllowShopping')?.checked)out.push({destination:'shopping',element:document.getElementById('roughShoppingInput')});
      if(document.getElementById('roughAllowItem')?.checked)out.push({destination:'item',element:document.getElementById('roughItemInput')});
    }
    return out;
  };
  const nonblankLines=text=>String(text||'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  const destinations=()=>fieldList().map(x=>({value:x.destination,label:label(x.destination)}));
  const render=(items,source)=>{
    const dests=destinations();
    preview.innerHTML=`<h3>下書き確認</h3><p class="small">${source==='gemini'?'AIが入力欄ごとの内容を整理しました。':'AIを利用できなかったため、入力内容をそのまま下書きにしました。'} 登録先は入力欄から固定されています。必要なら許可済みの登録先へ移動できます。</p>${items.map((item,index)=>`<div class="rough-draft-row" data-rough-index="${index}"><select class="rough-draft-destination" aria-label="${index+1}行目の登録先">${dests.map(d=>`<option value="${d.value}" ${d.value===item.destination?'selected':''}>${d.label}</option>`).join('')}</select><input class="rough-draft-title" maxlength="200" value="${esc(item.title)}" aria-label="${index+1}行目の下書き">${item.quantity?`<span class="small">数量: ${esc(item.quantity)}</span>`:''}${item.category?`<span class="small">カテゴリ: ${esc(item.category)}</span>`:''}${item.dueDate?`<span class="small">日付: ${esc(item.dueDate)}${item.dueTime?` ${esc(item.dueTime)}`:''}</span>`:''}</div>`).join('')}<p class="small">※ まだ登録されていません。内容を確認してから次の保存段階へ進みます。</p>`;
    preview.hidden=false;preview.scrollIntoView({block:'nearest'});
  };
  button.onclick=async()=>{
    const fields=fieldList().map(x=>({destination:x.destination,text:String(x.element?.value||'')}));
    const totalChars=fields.reduce((n,x)=>n+x.text.length,0),totalLines=fields.reduce((n,x)=>n+nonblankLines(x.text).length,0);
    if(totalChars>4000){alert('ざっくり入力は全入力欄を合計して4,000文字以内にしてください。');return;}
    if(totalLines<1){alert('ざっくり入力を入力してください。');document.getElementById('roughMainInput')?.focus();return;}
    if(totalLines>20){alert('ざっくり入力は全入力欄を合計して20行以内にしてください。');return;}
    const csrf=String(form.elements.csrf?.value||'');
    button.disabled=true;const oldText=button.textContent;button.textContent='AIで整理中…';
    try{
      const response=await fetch('/api/task-rough-input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,primaryType:primary(),fields})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error('rough-input analysis failed');
      render(data.items,data.source);
    }catch{
      if(typeof fallbackPreview==='function')fallbackPreview.call(button);
    }finally{button.disabled=false;button.textContent=oldText;}
  };
  document.documentElement.dataset.taskRoughInputAi='ready';
}catch{document.documentElement.dataset.taskRoughInputAi='error';}
})();
