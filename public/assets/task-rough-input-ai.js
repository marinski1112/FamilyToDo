(() => {
'use strict';
try{
  const form=document.getElementById('taskForm'),button=document.getElementById('roughPreviewButton'),preview=document.getElementById('roughPreview');
  if(!form||!button||!preview)return;
  const fallbackPreview=button.onclick;
  const payload=JSON.parse(document.getElementById('taskNewPayload')?.textContent||'{}');
  const categoryOptions=Array.isArray(payload.categoryOptions)?payload.categoryOptions.map(x=>String(x||'').trim()).filter(Boolean):[];
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
  const fieldPayload=()=>fieldList().map(x=>({destination:x.destination,text:String(x.element?.value||'')}));
  const snapshot=fields=>JSON.stringify({primaryType:primary(),fields});
  const nonblankLines=text=>String(text||'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  const destinations=()=>fieldList().map(x=>({value:x.destination,label:label(x.destination)}));
  const firstHttpUrl=text=>{const m=String(text||'').match(/https?:\/\/[^\s<>"']+/i);if(!m)return '';try{const u=new URL(m[0]);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const dateValue=(name,fallback='')=>String(form.elements[name]?.value||fallback);
  const checked=name=>Boolean(form.elements[name]?.checked);
  const assigneeOptions=()=>[...form.querySelectorAll('[name=assignees]')].map(input=>({value:String(input.value),label:String(input.closest('label')?.textContent||'').trim()})).filter(x=>x.value&&x.label);
  const categorySelect=value=>`<select class="rough-draft-category" aria-label="カテゴリー"><option value="">カテゴリーなし</option>${categoryOptions.map(name=>`<option value="${esc(name)}" ${name===value?'selected':''}>${esc(name)}</option>`).join('')}<option value="__custom__" ${value&&!categoryOptions.includes(value)?'selected':''}>自由入力</option></select><input class="rough-draft-category-custom" maxlength="100" value="${esc(value&&!categoryOptions.includes(value)?value:'')}" placeholder="カテゴリー" ${value&&!categoryOptions.includes(value)?'':'hidden'}>`;
  const commonDateDetails=item=>`<div class="rough-detail-grid"><label>日付<input type="date" class="rough-draft-due-date" value="${esc(item.dueDate||'')}"></label><label>時刻<input type="time" class="rough-draft-due-time" value="${esc(item.dueTime||'')}"></label></div>`;
  const mainAdvanced=(item,destination)=>{
    const isEvent=destination==='event',isPrivate=checked('is_private'),calendarVisible=checked('calendar_visible'),completion=String(form.elements.completion_mode?.value||'ANY'),start=dateValue('dateOnly',item.dueDate||''),end=dateValue('endDateOnly',start),allDay=checked('allDay'),startTime=dateValue('startTime',item.dueTime||''),endTime=dateValue('endTime',''),location=dateValue('location',''),reminder=dateValue('reminderAt',''),color=String(form.elements.calendar_color?.value||'');
    const badges=[isPrivate?'🔒 自分専用':'家族共有',calendarVisible?'📅 表示':'📅 非表示',start?`開始 ${start}`:'日付なし'];
    return `<div class="rough-draft-summary small">${badges.map(esc).join(' ・ ')}</div><details class="rough-advanced"><summary>詳細設定</summary><div class="rough-detail-grid"><label>開始日<input type="date" class="rough-main-start-date" value="${esc(start)}"></label><label>終了・期限日<input type="date" class="rough-main-end-date" value="${esc(end)}"></label><label class="checkrow"><input type="checkbox" class="rough-main-all-day" ${allDay?'checked':''}> 終日</label><label>開始時刻<input type="time" class="rough-main-start-time" value="${esc(startTime)}"></label><label>終了時刻<input type="time" class="rough-main-end-time" value="${esc(endTime)}"></label><label>場所<input class="rough-main-location" maxlength="500" value="${esc(location)}"></label><label class="checkrow"><input type="checkbox" class="rough-main-private" ${isPrivate?'checked':''}> 🔒 自分専用</label><label class="checkrow"><input type="checkbox" class="rough-main-calendar-visible" ${calendarVisible?'checked':''}> カレンダーに表示</label><label>カレンダー色<select class="rough-main-calendar-color">${[...form.elements.calendar_color?.options||[]].map(o=>`<option value="${esc(o.value)}" ${o.value===color?'selected':''}>${esc(o.textContent||o.value)}</option>`).join('')}</select></label>${isEvent?'':`<label>完了条件<select class="rough-main-completion"><option value="ANY" ${completion==='ANY'?'selected':''}>誰か1人で完了</option><option value="ALL" ${completion==='ALL'?'selected':''}>担当者全員が完了</option></select></label>`}<fieldset class="rough-main-assignees"><legend>担当者</legend>${assigneeOptions().map(a=>`<label class="checkrow inline-check"><input type="checkbox" value="${esc(a.value)}"> ${esc(a.label)}</label>`).join('')}</fieldset><label>通知日時<input type="datetime-local" class="rough-main-reminder" value="${esc(reminder)}"></label></div></details>`;
  };
  const rowBody=(item,index,dests)=>{
    const destination=String(item.destination||''),url=destination==='shopping'?firstHttpUrl(item.originalText):'';
    const destinationSelect=`<select class="rough-draft-destination" aria-label="${index+1}行目の登録先">${dests.map(d=>`<option value="${d.value}" ${d.value===destination?'selected':''}>${d.label}</option>`).join('')}</select>`;
    const title=`<input class="rough-draft-title" maxlength="200" value="${esc(item.title)}" aria-label="${index+1}行目の下書き">`;
    if(destination==='shopping')return `${destinationSelect}${title}<div class="rough-draft-basic-grid"><label>数量<input class="rough-draft-quantity" maxlength="40" value="${esc(item.quantity||'')}"></label><label>カテゴリー${categorySelect(String(item.category||''))}</label><label class="rough-url-field">URL<input type="url" class="rough-draft-url" maxlength="2000" value="${esc(url)}" placeholder="https://..."></label></div>${item.dueDate?`<div class="rough-draft-summary small">期限 ${esc(item.dueDate)}${item.dueTime?` ${esc(item.dueTime)}`:''}</div>`:''}<details class="rough-row-details"><summary>期限など</summary>${commonDateDetails(item)}</details>`;
    if(destination==='item'||destination==='child_task')return `${destinationSelect}${title}${item.dueDate?`<div class="rough-draft-summary small">期限 ${esc(item.dueDate)}${item.dueTime?` ${esc(item.dueTime)}`:''}</div>`:''}<details class="rough-row-details"><summary>詳細設定</summary>${commonDateDetails(item)}</details>`;
    return `${destinationSelect}${title}${mainAdvanced(item,destination)}`;
  };
  const bindPreviewInteractions=()=>{
    preview.querySelectorAll('.rough-draft-category').forEach(select=>select.addEventListener('change',()=>{const custom=select.parentElement?.querySelector('.rough-draft-category-custom');if(custom){custom.hidden=select.value!=='__custom__';if(!custom.hidden)custom.focus();}}));
  };
  const render=(items,source)=>{
    const dests=destinations();
    preview.innerHTML=`<h3>下書き確認</h3><p class="small">${source==='gemini'?'AIが内容を整理しました。':'AIを利用できなかったため、入力内容をそのまま下書きにしました。'} 必要な項目だけ確認し、間違いがあれば修正してください。詳細設定は必要なときだけ開けます。</p>${items.map((item,index)=>`<div class="rough-draft-row" data-rough-index="${index}" data-destination="${esc(item.destination)}">${rowBody(item,index,dests)}</div>`).join('')}<p class="small">※ まだ登録されていません。次の段階で、この確認内容を明示的に保存できるようにします。</p>`;
    bindPreviewInteractions();preview.hidden=false;preview.scrollIntoView({block:'nearest'});
  };
  button.onclick=async()=>{
    const fields=fieldPayload(),requestSnapshot=snapshot(fields);
    const totalChars=fields.reduce((n,x)=>n+x.text.length,0),totalLines=fields.reduce((n,x)=>n+nonblankLines(x.text).length,0);
    if(totalChars>4000){alert('ざっくり入力は全入力欄を合計して4,000文字以内にしてください。');return;}
    if(totalLines<1){alert('ざっくり入力を入力してください。');document.getElementById('roughMainInput')?.focus();return;}
    if(totalLines>20){alert('ざっくり入力は全入力欄を合計して20行以内にしてください。');return;}
    const csrf=String(form.elements.csrf?.value||'');
    button.disabled=true;const oldText=button.textContent;button.textContent='AIで整理中…';
    try{
      const response=await fetch('/api/task-rough-input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,primaryType:primary(),fields})});
      const data=await response.json().catch(()=>null);
      if(snapshot(fieldPayload())!==requestSnapshot)return;
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error('rough-input analysis failed');
      render(data.items,data.source);
    }catch{
      if(snapshot(fieldPayload())!==requestSnapshot)return;
      if(typeof fallbackPreview==='function')fallbackPreview.call(button);
    }finally{button.disabled=false;button.textContent=oldText;}
  };
  document.documentElement.dataset.taskRoughInputAi='ready';
}catch{document.documentElement.dataset.taskRoughInputAi='error';}
})();
