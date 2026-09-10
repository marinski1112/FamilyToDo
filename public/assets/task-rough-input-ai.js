(() => {
'use strict';
try{
  const form=document.getElementById('taskForm'),button=document.getElementById('roughPreviewButton'),preview=document.getElementById('roughPreview');
  if(!form||!button||!preview)return;
  const payload=JSON.parse(document.getElementById('taskNewPayload')?.textContent||'{}');
  const categoryOptions=Array.isArray(payload.categoryOptions)?payload.categoryOptions.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!document.getElementById('roughConfirmUiStyle')){
    const style=document.createElement('style');style.id='roughConfirmUiStyle';style.textContent=`.task-entry-card .task-rough-input{padding:0;margin:0 0 16px;background:none;border:0}
.task-entry-card h1{font-size:22px!important;margin-bottom:12px}
.task-rough-input [hidden]{display:none!important}
.task-entry-card #roughInputToggle{border:0;padding:0;min-height:44px;justify-content:flex-start;background:none;font-size:17px}
.task-rough-input .rough-intro{margin:0 0 10px;color:#475569;font-size:14px}
.task-rough-input .rough-primary-types{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 12px;padding:0;border:0}
.task-rough-input .rough-primary-types legend{font-size:14px;font-weight:700;margin-bottom:4px}
.task-rough-input .rough-primary-types .checkrow{min-height:44px!important;margin:0!important;font-size:14px}
.task-rough-input .rough-input-block>label{font-size:14px;margin:0 0 4px}
.task-rough-input textarea{font-size:16px;line-height:1.5}
.task-rough-input #roughMainInput{min-height:112px;margin:0}
.task-rough-input summary,.task-manual-fields>summary{cursor:pointer;min-height:44px;padding:10px 0;font-size:14px;font-weight:600;line-height:1.5}
.task-rough-input #roughChildOptions{margin:4px 0}
.task-rough-input .rough-input-actions{display:flex;align-items:flex-start;gap:12px;margin:8px 0}
.task-rough-input .rough-input-help{flex:1;min-width:0}
.task-rough-input .rough-input-help summary{font-weight:400}
.task-rough-input #roughPreviewButton{min-height:44px;margin:0}
.task-rough-input #roughPreviewButton.rough-analysis-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px}
.rough-analysis-spinner{display:inline-block;width:18px;height:18px;box-sizing:border-box;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:roughAnalysisSpin .8s linear infinite;flex:0 0 auto}
@keyframes roughAnalysisSpin{to{transform:rotate(360deg)}}
.task-rough-input .rough-preview{margin-top:16px;border:0;border-top:1px solid #e2e8f0;background:none;padding:12px 0 0}
.task-rough-input .rough-preview h3{font-size:17px;margin:0 0 4px}
.task-rough-input .rough-preview>p{margin:4px 0 8px;font-size:13px;color:#475569}
.rough-product-link-diagnostic{margin:8px 0;padding:8px 10px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.rough-draft-row{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid #e2e8f0}
.rough-draft-row:last-of-type{border-bottom:0}
.rough-draft-heading{display:grid;grid-template-columns:80px minmax(0,1fr) 44px;gap:6px;align-items:center}
.rough-draft-heading>*{min-width:0;max-width:100%;box-sizing:border-box}
.task-rough-input .rough-draft-heading input,.task-rough-input .rough-draft-heading select{width:100%;min-height:44px;margin:0;font-size:16px;padding:7px 8px}
.rough-draft-kind{font-size:14px;color:#475569}
.rough-draft-basic-grid,.rough-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.task-rough-input .rough-draft-basic-grid label,.task-rough-input .rough-detail-grid label{display:grid;gap:4px;min-width:0;font-size:14px}
.task-rough-input .rough-draft-basic-grid input,.task-rough-input .rough-draft-basic-grid select,.task-rough-input .rough-detail-grid input,.task-rough-input .rough-detail-grid select{max-width:100%;min-width:0;box-sizing:border-box;font-size:16px;min-height:44px;margin:0}
.rough-advanced,.rough-row-details{margin:0}
.task-rough-input .rough-advanced>summary,.task-rough-input .rough-row-details>summary{padding:8px 0}
.rough-draft-summary{color:#475569}
.rough-shopping-summary{overflow-wrap:anywhere;color:#475569}
.rough-main-assignees,.rough-child-assignees,.rough-item-assignees,.rough-url-field{grid-column:1/-1;min-width:0}
.rough-save-actions{display:grid;gap:4px;margin-top:12px}
.rough-remove{width:44px;height:44px;min-height:44px;padding:0!important;margin:0!important;background:#f1f5f9;color:#475569;font-size:20px;border:0;border-radius:10px}
.rough-summary-choice{font-size:13px!important;min-height:44px!important;margin:4px 0!important}.rough-summary-choice input{flex:none}
.rough-save-status{font-size:13px;line-height:1.5}.rough-save-status:empty{display:none}
.task-rough-input .rough-save-actions button{min-height:44px}
.task-manual-fields{border-top:1px solid #e2e8f0;padding-top:4px}
@media(max-width:340px){.rough-draft-heading{grid-template-columns:70px minmax(0,1fr) 44px}.rough-draft-basic-grid,.rough-detail-grid{grid-template-columns:1fr}}`;document.head.appendChild(style);
  }
  let analysisTimer=null;
  const stopAnalysisLoading=()=>{if(analysisTimer){clearInterval(analysisTimer);analysisTimer=null;}button.classList.remove('rough-analysis-loading');button.removeAttribute('aria-busy');};
  const startAnalysisLoading=()=>{
    stopAnalysisLoading();const startedAt=Date.now();button.classList.add('rough-analysis-loading');button.setAttribute('aria-busy','true');button.innerHTML='<span class="rough-analysis-spinner" aria-hidden="true"></span><span class="rough-analysis-label">AIで整理中… 0秒</span>';
    const update=()=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000)),label=button.querySelector('.rough-analysis-label');if(label)label.textContent=seconds>=15?`商品情報を確認中… ${seconds}秒`:`AIで整理中… ${seconds}秒`;};
    update();analysisTimer=setInterval(update,1000);
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const summaryChoice=document.createElement('label');summaryChoice.className='checkrow rough-summary-choice';summaryChoice.innerHTML='<input type="checkbox" id="roughSummarize"><span>文章を1つのタスク・予定に要約する</span>';
  document.getElementById('roughMainInput')?.closest('.rough-input-block')?.after(summaryChoice);
  const summarize=()=>['task','event'].includes(primary())&&Boolean(summaryChoice.querySelector('input').checked);
  const syncSummaryChoice=()=>{summaryChoice.hidden=!['task','event'].includes(primary());preview.hidden=true;};
  form.querySelectorAll('[name=rough_primary_type]').forEach(input=>input.addEventListener('change',syncSummaryChoice));summaryChoice.addEventListener('change',()=>{preview.hidden=true;});syncSummaryChoice();
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
  const snapshot=fields=>JSON.stringify({primaryType:primary(),fields,summarize:summarize()});
  const nonblankLines=text=>String(text||'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  const destinations=()=>fieldList().map(x=>({value:x.destination,label:label(x.destination)}));
  const firstHttpUrl=text=>{const m=String(text||'').match(/https?:\/\/[^\s<>"']+/i);if(!m)return '';const candidate=m[0].replace(/[),.;。、「」』】]+$/u,'');try{const u=new URL(candidate);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const dateValue=(name,fallback='')=>String(form.elements[name]?.value||fallback);
  const checked=name=>Boolean(form.elements[name]?.checked);
  const assigneeOptions=()=>[...form.querySelectorAll('[name=assignees]')].map(input=>({value:String(input.value),label:String(input.closest('label')?.textContent||'').trim(),checked:Boolean(input.checked)})).filter(x=>x.value&&x.label);
  const assigneeFieldset=(className,selected)=>{const selectedSet=Array.isArray(selected)?new Set(selected.map(String)):null;return `<fieldset class="${className}"><legend>担当者</legend>${assigneeOptions().map(a=>`<label class="checkrow inline-check"><input type="checkbox" value="${esc(a.value)}" ${(selectedSet?selectedSet.has(a.value):a.checked)?'checked':''}> ${esc(a.label)}</label>`).join('')}</fieldset>`;};
  const colorOptions=()=>Array.from(form.elements.calendar_color?.options||[]);
  const categorySelect=value=>`<select class="rough-draft-category" aria-label="カテゴリー"><option value="">カテゴリーなし</option>${categoryOptions.map(name=>`<option value="${esc(name)}" ${name===value?'selected':''}>${esc(name)}</option>`).join('')}<option value="__custom__" ${value&&!categoryOptions.includes(value)?'selected':''}>自由入力</option></select><input class="rough-draft-category-custom" maxlength="100" value="${esc(value&&!categoryOptions.includes(value)?value:'')}" placeholder="カテゴリー" ${value&&!categoryOptions.includes(value)?'':'hidden'}>`;
  const commonDateDetails=item=>`<div class="rough-detail-grid"><label>日付<input type="date" class="rough-draft-due-date" value="${esc(item.dueDate||'')}"></label><label>時刻<input type="time" class="rough-draft-due-time" value="${esc(item.dueTime||'')}"></label></div>`;
  const mainAdvanced=(item,destination)=>{
    const has=key=>Object.prototype.hasOwnProperty.call(item,key),isEvent=destination==='event',isPrivate=has('isPrivate')?Boolean(item.isPrivate):checked('is_private'),calendarVisible=has('calendarVisible')?Boolean(item.calendarVisible):checked('calendar_visible'),completion=String(item.completion||form.elements.completion_mode?.value||'ANY'),start=String(item.startDate??item.dueDate??(payload.returnTo==='calendar'?dateValue('dateOnly',''):'')),end=String(item.endDate??item.dueDate??start),startTime=String(item.startTime||item.dueTime||dateValue('startTime','')),allDay=item.dueTime?false:(has('allDay')?Boolean(item.allDay):checked('allDay')),endTime=has('endTime')?String(item.endTime||''):dateValue('endTime',''),location=has('location')?String(item.location||''):dateValue('location',''),description=has('description')?String(item.description||''):dateValue('description',''),reminder=has('reminderAt')?String(item.reminderAt||''):dateValue('reminderAt',''),color=has('calendarColor')?String(item.calendarColor||''):String(form.elements.calendar_color?.value||'');
    const badges=[isPrivate?'🔒 自分専用':'家族共有',calendarVisible?'📅 表示':'📅 非表示',start?`開始 ${start}`:'日付なし'];
    return `<div class="rough-draft-summary small">${badges.map(esc).join(' ・ ')}</div><details class="rough-advanced"><summary>詳細設定</summary><div class="rough-detail-grid"><label>開始日<input type="date" class="rough-main-start-date" value="${esc(start)}"></label><label>終了・期限日<input type="date" class="rough-main-end-date" value="${esc(end)}"></label><label class="checkrow"><input type="checkbox" class="rough-main-all-day" ${allDay?'checked':''}> 終日</label><label>開始時刻<input type="time" class="rough-main-start-time" value="${esc(startTime)}"></label><label>終了時刻<input type="time" class="rough-main-end-time" value="${esc(endTime)}"></label><label>場所<input class="rough-main-location" maxlength="500" value="${esc(location)}"></label><label class="rough-url-field">説明・メモ<textarea class="rough-main-description" maxlength="5000">${esc(description)}</textarea></label><label class="checkrow"><input type="checkbox" class="rough-main-private" ${isPrivate?'checked':''}> 🔒 自分専用</label><label class="checkrow"><input type="checkbox" class="rough-main-calendar-visible" ${calendarVisible?'checked':''}> カレンダーに表示</label><label>カレンダー色<select class="rough-main-calendar-color">${colorOptions().map(o=>`<option value="${esc(o.value)}" ${o.value===color?'selected':''}>${esc(o.textContent||o.value)}</option>`).join('')}</select></label>${isEvent?'':`<label>完了条件<select class="rough-main-completion"><option value="ANY" ${completion==='ANY'?'selected':''}>誰か1人で完了</option><option value="ALL" ${completion==='ALL'?'selected':''}>担当者全員が完了</option></select></label>`}${assigneeFieldset('rough-main-assignees',item.assignees)}<label>通知日時<input type="datetime-local" class="rough-main-reminder" value="${esc(reminder)}"></label></div></details>`;
  };
  const rowBody=(item,index,dests)=>{
    const destination=String(item.destination||''),url=destination==='shopping'?String(item.url||firstHttpUrl(item.originalText)):'',destinationSelect=`<select class="rough-draft-destination" aria-label="${index+1}行目の登録先" ${dests.length===1?'hidden':''}>${dests.map(d=>`<option value="${d.value}" ${d.value===destination?'selected':''}>${d.label}</option>`).join('')}</select>`,title=`<input class="rough-draft-title" maxlength="200" value="${esc(item.title)}" aria-label="${index+1}行目の下書き">`;
    const heading=`<div class="rough-draft-heading">${destinationSelect}${dests.length===1?`<span class="rough-draft-kind">${esc(label(destination))}</span>`:''}${title}<button type="button" class="rough-remove" aria-label="この下書きを削除">×</button></div>`;
    if(destination==='shopping')return `${heading}<details class="rough-row-details"><summary class="rough-shopping-summary">数量 ${esc(item.quantity||'1')} ・ ${esc(item.category||'カテゴリーなし')}${item.dueDate?` ・ 期限 ${esc(item.dueDate)}`:''}${url?' ・ URLあり':''} — 変更</summary><div class="rough-draft-basic-grid"><label>数量<input class="rough-draft-quantity" maxlength="40" value="${esc(item.quantity||'')}" placeholder="1"></label><label>カテゴリー${categorySelect(String(item.category||''))}</label><label class="rough-url-field">URL<input type="url" class="rough-draft-url" maxlength="2000" value="${esc(url)}" placeholder="https://..."></label></div>${commonDateDetails(item)}</details>`;
    if(destination==='item')return `${heading}${item.dueDate?`<div class="rough-draft-summary small">期限 ${esc(item.dueDate)}</div>`:''}<details class="rough-row-details"><summary>詳細設定</summary>${commonDateDetails(item)}${assigneeFieldset('rough-item-assignees',item.assignees)}</details>`;
    if(destination==='child_task'){const completion=String(item.completion||'ANY');return `${heading}${item.dueDate?`<div class="rough-draft-summary small">期限 ${esc(item.dueDate)}${item.dueTime?` ${esc(item.dueTime)}`:''}</div>`:''}<details class="rough-row-details"><summary>詳細設定</summary>${commonDateDetails(item)}<label>完了条件<select class="rough-child-completion"><option value="ANY" ${completion==='ANY'?'selected':''}>誰か1人で完了</option><option value="ALL" ${completion==='ALL'?'selected':''}>担当者全員が完了</option></select></label>${assigneeFieldset('rough-child-assignees',item.assignees)}<p class="small">親が自分専用の場合、担当者は自動的に自分だけになります。</p></details>`;}
    return `${heading}${mainAdvanced(item,destination)}`;
  };
  const selectedRowAssignees=(row,selector)=>[...row.querySelectorAll(selector)].filter(x=>x.checked).map(x=>String(x.value));
  const syncItemFromRow=(item,row)=>{
    item.title=String(row.querySelector('.rough-draft-title')?.value??item.title);item.dueDate=String(row.querySelector('.rough-draft-due-date,.rough-main-start-date')?.value??item.dueDate??'')||null;item.dueTime=String(row.querySelector('.rough-draft-due-time,.rough-main-start-time')?.value??item.dueTime??'')||null;
    if(item.destination==='shopping'){item.quantity=String(row.querySelector('.rough-draft-quantity')?.value||'')||null;const cat=row.querySelector('.rough-draft-category'),custom=row.querySelector('.rough-draft-category-custom');item.category=cat?.value==='__custom__'?String(custom?.value||'').trim()||null:String(cat?.value||'').trim()||null;item.url=String(row.querySelector('.rough-draft-url')?.value||'').trim();}
    else if(item.destination==='item'){item.assignees=selectedRowAssignees(row,'.rough-item-assignees input[type=checkbox]');}
    else if(item.destination==='child_task'){item.completion=String(row.querySelector('.rough-child-completion')?.value||'ANY');item.assignees=selectedRowAssignees(row,'.rough-child-assignees input[type=checkbox]');}
    else if(item.destination==='task'||item.destination==='event'){item.startDate=String(row.querySelector('.rough-main-start-date')?.value||'');item.endDate=String(row.querySelector('.rough-main-end-date')?.value||'');item.allDay=Boolean(row.querySelector('.rough-main-all-day')?.checked);item.startTime=String(row.querySelector('.rough-main-start-time')?.value||'');item.endTime=String(row.querySelector('.rough-main-end-time')?.value||'');item.location=String(row.querySelector('.rough-main-location')?.value||'');item.description=String(row.querySelector('.rough-main-description')?.value||'');item.isPrivate=Boolean(row.querySelector('.rough-main-private')?.checked);item.calendarVisible=Boolean(row.querySelector('.rough-main-calendar-visible')?.checked);item.calendarColor=String(row.querySelector('.rough-main-calendar-color')?.value||'');item.completion=String(row.querySelector('.rough-main-completion')?.value||'ANY');item.assignees=selectedRowAssignees(row,'.rough-main-assignees input[type=checkbox]');item.reminderAt=String(row.querySelector('.rough-main-reminder')?.value||'');}
  };
  const bindRow=(row,item,index,dests)=>{
    row.querySelector('.rough-remove')?.addEventListener('click',()=>{const next=row.nextElementSibling?.querySelector('.rough-draft-title')||row.previousElementSibling?.querySelector('.rough-draft-title');row.remove();next?.focus();if(!preview.querySelector('.rough-draft-row')){preview.hidden=true;document.getElementById('roughMainInput')?.focus();}});
    const syncShoppingSummary=()=>{
      const summary=row.querySelector('.rough-shopping-summary');if(!summary)return;
      const quantity=String(row.querySelector('.rough-draft-quantity')?.value||'1');
      const category=row.querySelector('.rough-draft-category'),custom=row.querySelector('.rough-draft-category-custom');
      const categoryName=category?.value==='__custom__'?String(custom?.value||'').trim():String(category?.value||'');
      const due=String(row.querySelector('.rough-draft-due-date')?.value||'');
      const url=String(row.querySelector('.rough-draft-url')?.value||'').trim();
      summary.textContent=[`数量 ${quantity}`,categoryName||'カテゴリーなし',due?`期限 ${due}`:'',url?'URLあり':''].filter(Boolean).join(' ・ ')+' — 変更';
    };
    const syncSummary=()=>{syncShoppingSummary();const summary=row.querySelector('.rough-draft-summary');if(summary&&['task','event'].includes(item.destination)){const date=row.querySelector('.rough-main-start-date')?.value;summary.textContent=[row.querySelector('.rough-main-private')?.checked?'🔒 自分専用':'家族共有',row.querySelector('.rough-main-calendar-visible')?.checked?'📅 表示':'📅 非表示',date?'開始 '+date:'日付なし'].join(' ・ ');}};
    row.oninput=syncSummary;row.onchange=syncSummary;
    const category=row.querySelector('.rough-draft-category');if(category)category.addEventListener('change',()=>{const custom=row.querySelector('.rough-draft-category-custom');if(custom){custom.hidden=category.value!=='__custom__';if(!custom.hidden)custom.focus();}});
    const destination=row.querySelector('.rough-draft-destination');if(destination)destination.addEventListener('change',()=>{syncItemFromRow(item,row);item.destination=destination.value;row.dataset.destination=item.destination;row.innerHTML=rowBody(item,index,dests);bindRow(row,item,index,dests);});
  };
  const productLinkDiagnosticHtml=diagnostics=>{
    const rows=(Array.isArray(diagnostics)?diagnostics:[]).filter(d=>d&&d.titleResolved!==true).slice(0,4);
    if(!rows.length)return '';
    return `<div class="rough-product-link-diagnostic" role="status"><strong>商品URL診断</strong><br>${rows.map((d,index)=>`#${index+1} stage=${esc(d.stage||'UNKNOWN')} / status=${esc(d.httpStatusClass||'NONE')} / redirects=${Number.isInteger(d.redirectCount)?d.redirectCount:0} / content=${esc(d.contentType||'NONE')} / title=${esc(d.titleSource||'NONE')} / reason=${esc(d.reason||'UNKNOWN')}`).join('<br>')}</div>`;
  };
  const render=(items,source,reason='',productLinkDiagnostics=[])=>{
    const dests=destinations();
    preview.innerHTML=`<h3>下書き確認</h3><p class="small">${source==='gemini'?'AIで整理しました。':reason==='SIMPLE_INPUT'?'入力をそのまま下書きにしました。':'AIを利用できなかったため、原文の下書きです。'} 日付・数量を確認してください。</p>${productLinkDiagnosticHtml(productLinkDiagnostics)}${items.map((item,index)=>`<div class="rough-draft-row" data-rough-index="${index}" data-destination="${esc(item.destination)}">${rowBody(item,index,dests)}</div>`).join('')}`;
    [...preview.querySelectorAll('.rough-draft-row')].forEach((row,index)=>bindRow(row,items[index],index,dests));preview.hidden=false;preview.scrollIntoView({block:'nearest'});
  };
  button.onclick=async()=>{
    if(preview.dataset.saving==='1')return;
    const fields=fieldPayload(),requestSnapshot=snapshot(fields),totalChars=fields.reduce((n,x)=>n+x.text.length,0),totalLines=fields.reduce((n,x)=>n+nonblankLines(x.text).length,0);
    if(totalChars>4000){alert('ざっくり入力は全入力欄を合計して4,000文字以内にしてください。');return;}
    if(totalLines<1){alert('ざっくり入力を入力してください。');document.getElementById('roughMainInput')?.focus();return;}
    if(!summarize()&&totalLines>20){alert('ざっくり入力は全入力欄を合計して20行以内にしてください。');return;}
    const csrf=String(form.elements.csrf?.value||''),oldText=button.textContent;
    button.disabled=true;startAnalysisLoading();
    try{
      const response=await fetch('/api/task-rough-input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,primaryType:primary(),fields,summarize:summarize()}),signal:AbortSignal.timeout(45000)}),data=await response.json().catch(()=>null);
      if(snapshot(fieldPayload())!==requestSnapshot)return;
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error('rough-input analysis failed');
      render(data.items,data.source,data.reason,data.productLinkDiagnostics);
    }catch{
      if(snapshot(fieldPayload())!==requestSnapshot)return;
      const items=fields.flatMap(field=>(summarize()&&field.destination===primary()?[field.text.trim()]:nonblankLines(field.text)).filter(Boolean).map(text=>({destination:field.destination,originalText:text,title:text.split('\n')[0].slice(0,200),description:['task','event'].includes(field.destination)?text.slice(0,1000):null,quantity:null,category:null,dueDate:null,dueTime:null}))).slice(0,20);
      render(items,'deterministic','UNAVAILABLE');
    }finally{stopAnalysisLoading();button.disabled=false;button.textContent=oldText;}
  };
  // Progressive enhancement: keep original controls and their values in the same form.
  // Only collapse manual entry after the AI UI has initialized successfully.
  const rough=form.querySelector('.task-rough-input'),panel=document.getElementById('roughInputPanel'),toggle=document.getElementById('roughInputToggle');
  if(rough&&panel&&toggle){
    const manual=document.createElement('details');manual.className='task-manual-fields';manual.id='taskManualFields';
    const summary=document.createElement('summary');summary.textContent='1件ずつ手入力する';
    const body=document.createElement('div');body.className='task-manual-body';
    const originalChildren=[...form.children].filter(child=>child!==rough);
    manual.append(summary,body);
    for(const child of originalChildren)body.appendChild(child);
    body.querySelector('[autofocus]')?.removeAttribute('autofocus');
    form.appendChild(manual);
    form.closest('.form-card')?.classList.add('task-entry-card');
    panel.hidden=false;toggle.setAttribute('aria-expanded','true');
    // Enter in a draft field must not submit the unrelated, collapsed manual form.
    rough.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.target instanceof HTMLInputElement){event.preventDefault();}});
  }
  document.documentElement.dataset.taskRoughInputAi='ready';
}catch{document.documentElement.dataset.taskRoughInputAi='error';}
})();