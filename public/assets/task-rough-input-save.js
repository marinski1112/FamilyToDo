(() => {
'use strict';
try{
  const form=document.getElementById('taskForm'),preview=document.getElementById('roughPreview');
  if(!form||!preview)return;
  const payload=JSON.parse(document.getElementById('taskNewPayload')?.textContent||'{}');
  const csrf=()=>String(form.elements.csrf?.value||'');
  const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const value=(row,selector)=>String(row.querySelector(selector)?.value||'').trim();
  const checked=(row,selector)=>Boolean(row.querySelector(selector)?.checked);
  const selectedIds=(row,selector)=>[...row.querySelectorAll(selector)].filter(x=>x.checked).map(x=>Number(x.value)).filter(n=>Number.isInteger(n)&&n>0);
  const categoryValue=row=>{const select=row.querySelector('.rough-draft-category'),custom=row.querySelector('.rough-draft-category-custom');return select?.value==='__custom__'?String(custom?.value||'').trim():String(select?.value||'').trim();};
  const validUrl=url=>{if(!url)return true;try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
  const validDate=date=>!date||/^\d{4}-\d{2}-\d{2}$/.test(date);
  const errorMessage=(data,fallback)=>String(data?.error||fallback||'保存に失敗しました。');
  class SaveRequestError extends Error{constructor(message,uncertain=false){super(message);this.uncertain=uncertain;}}

  const analysisButton=document.getElementById('roughPreviewButton');
  if(analysisButton){
    if(!document.getElementById('roughAnalysisLoadingStyle')){const style=document.createElement('style');style.id='roughAnalysisLoadingStyle';style.textContent='.task-rough-input #roughPreviewButton.rough-analysis-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px}.rough-analysis-spinner{width:18px;height:18px;box-sizing:border-box;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:roughAnalysisSpin .8s linear infinite;flex:0 0 auto}@keyframes roughAnalysisSpin{to{transform:rotate(360deg)}}';document.head.appendChild(style);}
    let loadingTimer=null,loadingObserver=null;
    const stopLoading=()=>{if(loadingTimer){clearInterval(loadingTimer);loadingTimer=null;}loadingObserver?.disconnect();loadingObserver=null;analysisButton.classList.remove('rough-analysis-loading');};
    analysisButton.addEventListener('click',()=>setTimeout(()=>{
      if(!analysisButton.disabled)return;
      stopLoading();const startedAt=Date.now();analysisButton.classList.add('rough-analysis-loading');analysisButton.innerHTML='<span class="rough-analysis-spinner" aria-hidden="true"></span><span class="rough-analysis-label">AIで整理中… 0秒</span>';
      const label=analysisButton.querySelector('.rough-analysis-label'),update=()=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));if(label)label.textContent=seconds>=15?`商品情報を確認中… ${seconds}秒`:`AIで整理中… ${seconds}秒`;};
      loadingTimer=setInterval(update,1000);loadingObserver=new MutationObserver(()=>{if(!analysisButton.disabled)stopLoading();});loadingObserver.observe(analysisButton,{attributes:true,attributeFilter:['disabled']});
    },0));
  }

  const readRow=row=>{
    const destination=value(row,'.rough-draft-destination'),title=value(row,'.rough-draft-title');
    const taskCreateKey=['task','event','child_task'].includes(destination)?(row.dataset.taskCreateKey||(row.dataset.taskCreateKey=crypto.randomUUID())):'';
    const base={row,destination,title,taskCreateKey};
    if(destination==='shopping')return {...base,quantity:value(row,'.rough-draft-quantity')||'1',category:categoryValue(row),url:value(row,'.rough-draft-url'),dueDate:value(row,'.rough-draft-due-date')};
    if(destination==='item')return {...base,dueDate:value(row,'.rough-draft-due-date')};
    if(destination==='child_task')return {...base,dueDate:value(row,'.rough-draft-due-date'),dueTime:value(row,'.rough-draft-due-time'),completion:value(row,'.rough-child-completion')||'ANY',assignees:[]};
    return {...base,startDate:value(row,'.rough-main-start-date'),endDate:value(row,'.rough-main-end-date'),allDay:checked(row,'.rough-main-all-day'),startTime:value(row,'.rough-main-start-time'),endTime:value(row,'.rough-main-end-time'),location:value(row,'.rough-main-location'),description:value(row,'.rough-main-description'),isPrivate:checked(row,'.rough-main-private'),calendarVisible:checked(row,'.rough-main-calendar-visible'),calendarColor:value(row,'.rough-main-calendar-color'),completion:value(row,'.rough-main-completion')||'ANY',assignees:[],reminderAt:value(row,'.rough-main-reminder')};
  };

  const validateRows=rows=>{
    if(!rows.length)return '保存する下書きがありません。';
    for(const item of rows){
      if(!item.title)return 'タイトルが空の項目があります。';
      if(item.title.length>255)return 'タイトルは255文字以内にしてください。';
      if(item.destination==='shopping'){
        if(!validUrl(item.url))return `「${item.title}」のURLが不正です。`;
        if(item.category.length>255)return `「${item.title}」のカテゴリーが長すぎます。`;
        if(!validDate(item.dueDate))return `「${item.title}」の期限が不正です。`;
      }
      if((item.destination==='item'||item.destination==='child_task')&&!validDate(item.dueDate))return `「${item.title}」の日付が不正です。`;
      if(item.destination==='child_task'&&item.dueTime&&!item.dueDate)return `子タスク「${item.title}」で時刻を指定する場合は日付も指定してください。`;
      if((item.destination==='task'||item.destination==='event')&&(!validDate(item.startDate)||!validDate(item.endDate)))return `「${item.title}」の日付が不正です。`;
      if(item.destination==='event'&&!item.startDate)return `イベント「${item.title}」には開始日が必要です。`;
    }
    const roots=rows.filter(x=>x.destination==='task'||x.destination==='event'),children=rows.filter(x=>x.destination==='child_task');
    if(children.length&&!roots.some(x=>x.destination==='task'))return '子タスクを保存するには親タスクが1件必要です。';
    if(roots.length>1&&children.length)return '親候補が複数あるため、子タスクの親を決められません。メインのタスクを1件にしてください。';
    return '';
  };

  async function postJson(url,body){
    let response;
    try{response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}catch{throw new SaveRequestError('通信が途切れました。保存済みの可能性があるため、再試行する前に一覧を確認してください。',true);}
    const data=await response.json().catch(()=>null);
    if(response.ok&&data?.ok)return data;
    if(response.status>=500||!data||response.ok)throw new SaveRequestError('保存結果を確認できませんでした。保存済みの可能性があるため、再試行する前に一覧を確認してください。',true);
    throw new SaveRequestError(errorMessage(data),false);
  }
  async function deleteTask(id){
    if(!id)return;
    let response;try{response=await fetch(`/api/task?id=${encodeURIComponent(id)}`,{method:'DELETE',headers:{'x-csrf':csrf()}});}catch{throw new Error('作成途中のタスクを元に戻せませんでした。');}
    if(!response.ok)throw new Error('作成途中のタスクを元に戻せませんでした。');
  }
  async function rollbackTasks(ids){
    let failed=false;
    for(const id of [...ids].reverse()){try{await deleteTask(id);}catch{failed=true;}}
    return !failed;
  }
  const resetTaskCreateKeys=rows=>rows.filter(item=>['task','event','child_task'].includes(item.destination)).forEach(item=>{delete item.row.dataset.taskCreateKey;});

  const taskPayload=(item,parentTaskId=null,parentPrivate=false)=>({
    csrf:csrf(),idempotency_key:item.taskCreateKey||'',title:item.title,description:item.description||'',is_event:item.destination==='event',is_private:parentTaskId?parentPrivate:Boolean(item.isPrivate),
    dateOnly:item.startDate||item.dueDate||'',endDateOnly:item.endDate||item.dueDate||item.startDate||'',noDate:item.destination!=='event'&&!(item.startDate||item.dueDate),allDay:item.destination==='child_task'?!item.dueTime:Boolean(item.allDay),startTime:item.destination==='child_task'?(item.dueTime||''):(item.startTime||''),endTime:item.destination==='child_task'?'':(item.endTime||''),location:item.location||'',calendar_visible:item.destination==='child_task'?Boolean(item.dueDate):Boolean(item.calendarVisible),calendar_color:item.calendarColor||'',completion_mode:item.completion||'ANY',assignees:parentTaskId&&parentPrivate?[]:(item.assignees||[]),reminderAt:item.reminderAt||'',parent_task_id:parentTaskId,
  });

  async function saveTask(item,parentTaskId=null,parentPrivate=false){return await postJson('/api/task',taskPayload(item,parentTaskId,parentPrivate));}
  async function saveShopping(item){
    return await postJson('/api/shopping',{csrf:csrf(),action:'add',name:item.title,quantity:item.quantity||'1',category:item.category||'',url:item.url||'',due_date:item.dueDate||''});
  }
  async function saveItem(item){return await postJson('/api/item',{csrf:csrf(),name:item.title,date:item.dueDate||''});}

  async function saveRows(rows){
    const roots=rows.filter(x=>x.destination==='task'||x.destination==='event'),children=rows.filter(x=>x.destination==='child_task'),shopping=rows.filter(x=>x.destination==='shopping'),items=rows.filter(x=>x.destination==='item'),createdTaskIds=[];
    let savedGoods=0;
    try{
      for(const root of roots){const result=await saveTask(root);createdTaskIds.push(Number(result.id));}
      for(const child of children){const result=await saveTask(child,createdTaskIds[0],Boolean(roots[0]?.isPrivate));createdTaskIds.push(Number(result.id));}
      for(const item of shopping){await saveShopping(item);savedGoods++;}
      for(const item of items){await saveItem(item);savedGoods++;}
    }catch(error){
      // Independent goods are not removed by task rollback: never unlock a retry
      // after any goods succeeded or a response became uncertain.
      if(savedGoods||error?.uncertain)throw new SaveRequestError('一部が保存済み、または保存結果が不明です。重複を避けるため、再試行する前に一覧を確認してください。',true);
      const rolledBack=await rollbackTasks(createdTaskIds);
      if(!rolledBack)throw new SaveRequestError('一部のタスクを元に戻せませんでした。一覧を確認してください。',true);
      resetTaskCreateKeys(rows);
      throw error;
    }
    return {saved:createdTaskIds.length+savedGoods,date:roots[0]?.startDate||'',kind:roots[0]?.destination||primary()};
  }

  const redirectAfterSave=result=>{
    const savedDate=String(result.date||'');
    if(payload.returnTo==='calendar'&&(result.kind==='task'||result.kind==='event')){location.href=savedDate?`/app/calendar.php?month=${encodeURIComponent(savedDate.slice(0,7))}&date=${encodeURIComponent(savedDate)}`:'/app/calendar.php';return;}
    if(primary()==='shopping'){location.href='/app/tasks.php#shopping-checklist';return;}
    location.href=savedDate?`/app/tasks.php?date=${encodeURIComponent(savedDate)}`:'/app/tasks.php';
  };

  const ensureSaveAction=()=>{
    const rows=preview.querySelectorAll('.rough-draft-row');
    const structuredPreview=preview.querySelector('.rough-advanced,.rough-row-details');
    if(preview.hidden||!rows.length||!structuredPreview)return;
    for(const row of preview.querySelectorAll('.rough-draft-row[data-destination="shopping"],.rough-draft-row[data-destination="item"]'))row.querySelector('.rough-draft-due-time')?.closest('label')?.remove();
    let actions=preview.querySelector('.rough-save-actions');
    if(!actions){
      actions=document.createElement('div');actions.className='rough-save-actions';actions.innerHTML='<button type="button" class="btn" id="roughConfirmSave">この内容で保存</button><p class="rough-save-status" role="status" aria-live="polite"></p>';preview.appendChild(actions);
      const saveButton=actions.querySelector('#roughConfirmSave');
      saveButton.addEventListener('click',async()=>{
        if(preview.dataset.saving==='1')return;
        const status=actions.querySelector('.rough-save-status');
        const rows=[...preview.querySelectorAll('.rough-draft-row')].map(readRow),validation=validateRows(rows);
        if(validation){status.textContent=validation;return;}
        const controls=[...preview.querySelectorAll('input,select,textarea,button'),...form.querySelectorAll('.task-rough-input input,.task-rough-input textarea,#roughPreviewButton')],disabled=controls.map(control=>control.disabled);
        preview.dataset.saving='1';controls.forEach(control=>control.disabled=true);status.textContent='保存しています…';const old=saveButton.textContent;saveButton.textContent='保存中…';
        try{const result=await saveRows(rows);saveButton.textContent='保存しました';setTimeout(()=>redirectAfterSave(result),200);}
        catch(error){
          status.textContent=String(error?.message||'保存に失敗しました。内容を確認して再度お試しください。');
          if(error?.uncertain){saveButton.textContent='一覧で保存結果を確認してください';const link=document.createElement('a');const shoppingOnly=rows.every(item=>item.destination==='shopping');link.href=shoppingOnly?'/app/tasks.php#shopping-checklist':'/app/tasks.php';link.textContent=shoppingOnly?'買い物一覧を確認':'チェックリストを確認';link.className='btn gray';actions.append(link);}
          else{preview.dataset.saving='0';controls.forEach((control,index)=>control.disabled=disabled[index]);saveButton.textContent=old;}
        }
      });
    }
  };

  new MutationObserver(ensureSaveAction).observe(preview,{childList:true,subtree:true});
  ensureSaveAction();
  document.documentElement.dataset.taskRoughInputSave='ready';
}catch{document.documentElement.dataset.taskRoughInputSave='error';}
})();
