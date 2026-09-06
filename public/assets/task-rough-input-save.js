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
  const validUrl=url=>{if(!url)return true;try{return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}};
  const validDate=date=>!date||/^\d{4}-\d{2}-\d{2}$/.test(date);
  const errorMessage=(data,fallback)=>String(data?.error||fallback||'保存に失敗しました。');
  class SaveRequestError extends Error{constructor(message,uncertain=false){super(message);this.uncertain=uncertain;}}

  const readRow=row=>{
    const destination=value(row,'.rough-draft-destination'),title=value(row,'.rough-draft-title');
    const base={row,destination,title};
    if(destination==='shopping')return {...base,quantity:value(row,'.rough-draft-quantity')||'1',category:categoryValue(row),url:value(row,'.rough-draft-url'),dueDate:value(row,'.rough-draft-due-date')};
    if(destination==='item')return {...base,dueDate:value(row,'.rough-draft-due-date'),assignees:selectedIds(row,'.rough-item-assignees input[type=checkbox]')};
    if(destination==='child_task')return {...base,dueDate:value(row,'.rough-draft-due-date'),dueTime:value(row,'.rough-draft-due-time'),completion:value(row,'.rough-child-completion')||'ANY',assignees:selectedIds(row,'.rough-child-assignees input[type=checkbox]')};
    return {...base,startDate:value(row,'.rough-main-start-date'),endDate:value(row,'.rough-main-end-date'),allDay:checked(row,'.rough-main-all-day'),startTime:value(row,'.rough-main-start-time'),endTime:value(row,'.rough-main-end-time'),location:value(row,'.rough-main-location'),description:value(row,'.rough-main-description'),isPrivate:checked(row,'.rough-main-private'),calendarVisible:checked(row,'.rough-main-calendar-visible'),calendarColor:value(row,'.rough-main-calendar-color'),completion:value(row,'.rough-main-completion')||'ANY',assignees:selectedIds(row,'.rough-main-assignees input[type=checkbox]'),reminderAt:value(row,'.rough-main-reminder')};
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
    const roots=rows.filter(x=>x.destination==='task'||x.destination==='event'),children=rows.filter(x=>x.destination==='child_task'),related=rows.filter(x=>['child_task','shopping','item'].includes(x.destination));
    if(children.length&&!roots.length)return '子タスクを保存するには親タスクまたはイベントが1件必要です。';
    if(roots.length>1&&related.length)return '親候補が複数あるため、子タスク・買い物・持ち物の紐付け先を決められません。メインのタスク/イベントを1件にしてください。';
    return '';
  };

  async function postJson(url,body){
    let response;
    try{response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}catch{throw new SaveRequestError('通信が途切れました。保存済みの可能性があるため、再試行する前に一覧を確認してください。',true);}
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new SaveRequestError(errorMessage(data),false);
    return data;
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

  const taskPayload=(item,parentTaskId=null,parentPrivate=false)=>({
    csrf:csrf(),title:item.title,description:item.description||'',is_event:item.destination==='event',is_private:parentTaskId?parentPrivate:Boolean(item.isPrivate),
    dateOnly:item.startDate||item.dueDate||'',endDateOnly:item.endDate||item.dueDate||item.startDate||'',noDate:item.destination!=='event'&&!(item.startDate||item.dueDate),allDay:item.destination==='child_task'?!item.dueTime:Boolean(item.allDay),startTime:item.destination==='child_task'?(item.dueTime||''):(item.startTime||''),endTime:item.destination==='child_task'?'':(item.endTime||''),location:item.location||'',calendar_visible:item.destination==='child_task'?Boolean(item.dueDate):Boolean(item.calendarVisible),calendar_color:item.calendarColor||'',completion_mode:item.completion||'ANY',assignees:parentTaskId&&parentPrivate?[]:(item.assignees||[]),reminderAt:item.reminderAt||'',parent_task_id:parentTaskId,
  });

  async function saveTask(item,parentTaskId=null,parentPrivate=false){return await postJson('/api/task',taskPayload(item,parentTaskId,parentPrivate));}
  async function saveShopping(item,taskId=null){return await postJson('/api/shopping',{csrf:csrf(),action:'add',name:item.title,quantity:item.quantity||'1',category:item.category||'',url:item.url||'',due_date:item.dueDate||'',task_id:taskId||0});}
  async function saveItem(item,taskId=null){return await postJson('/api/item',{csrf:csrf(),name:item.title,date:item.dueDate||'',task_id:taskId||0,assignees:item.assignees||[]});}

  async function saveRows(rows){
    const roots=rows.filter(x=>x.destination==='task'||x.destination==='event'),children=rows.filter(x=>x.destination==='child_task'),shopping=rows.filter(x=>x.destination==='shopping'),items=rows.filter(x=>x.destination==='item'),createdTaskIds=[];
    if(roots.length===1){
      const parent=roots[0],parentResult=await saveTask(parent),parentId=Number(parentResult.id);createdTaskIds.push(parentId);
      try{
        for(const item of shopping)await saveShopping(item,parentId);
        for(const item of items)await saveItem(item,parentId);
        for(const child of children){const result=await saveTask(child,parentId,Boolean(parent.isPrivate));createdTaskIds.push(Number(result.id));}
      }catch(error){
        if(error?.uncertain)throw error;
        const rolledBack=await rollbackTasks(createdTaskIds);
        if(!rolledBack)throw new Error(`${String(error?.message||'関連項目の保存に失敗しました。')} 一部の作成内容を自動で戻せなかった可能性があります。`);
        throw error;
      }
      return {saved:1+children.length+shopping.length+items.length,date:parent.startDate||'',kind:parent.destination};
    }
    if(roots.length>1){
      try{for(const root of roots){const result=await saveTask(root);createdTaskIds.push(Number(result.id));}}
      catch(error){if(error?.uncertain)throw error;const rolledBack=await rollbackTasks(createdTaskIds);if(!rolledBack)throw new Error(`${String(error?.message||'保存に失敗しました。')} 一部のタスクを自動で戻せなかった可能性があります。`);throw error;}
      return {saved:roots.length,date:roots[0]?.startDate||'',kind:roots[0]?.destination||'task'};
    }
    let saved=0;
    try{for(const item of shopping){await saveShopping(item);saved++;}for(const item of items){await saveItem(item);saved++;}}
    catch(error){if(saved)throw new SaveRequestError(`${saved}件は保存済みです。残りの保存に失敗しました。重複を避けるため、再試行する前に一覧を確認してください。`,true);throw error;}
    return {saved,date:'',kind:primary()};
  }

  const redirectAfterSave=result=>{
    const savedDate=String(result.date||'');
    if(payload.returnTo==='calendar'&&(result.kind==='task'||result.kind==='event')){location.href=savedDate?`/app/calendar.php?month=${encodeURIComponent(savedDate.slice(0,7))}&date=${encodeURIComponent(savedDate)}`:'/app/calendar.php';return;}
    if(primary()==='shopping'){location.href='/app/shopping.php';return;}
    location.href=savedDate?`/app/tasks.php?date=${encodeURIComponent(savedDate)}`:'/app/tasks.php';
  };

  const ensureSaveAction=()=>{
    if(preview.hidden||!preview.querySelector('.rough-draft-row'))return;
    for(const row of preview.querySelectorAll('.rough-draft-row[data-destination="shopping"],.rough-draft-row[data-destination="item"]'))row.querySelector('.rough-draft-due-time')?.closest('label')?.remove();
    let actions=preview.querySelector('.rough-save-actions');
    if(!actions){
      actions=document.createElement('div');actions.className='rough-save-actions';actions.innerHTML='<button type="button" class="btn" id="roughConfirmSave">この内容で保存</button><p class="small">保存前にもう一度確認します。AIの下書きは、このボタンを押すまで登録されません。</p>';preview.appendChild(actions);
      const saveButton=actions.querySelector('#roughConfirmSave');
      saveButton.addEventListener('click',async()=>{
        const rows=[...preview.querySelectorAll('.rough-draft-row')].map(readRow),validation=validateRows(rows);
        if(validation){alert(validation);return;}
        if(!confirm(`${rows.length}件の確認済み下書きを保存します。よろしいですか？`))return;
        saveButton.disabled=true;const old=saveButton.textContent;saveButton.textContent='保存中…';
        try{const result=await saveRows(rows);saveButton.textContent='保存しました';setTimeout(()=>redirectAfterSave(result),200);}
        catch(error){alert(String(error?.message||'保存に失敗しました。内容を確認して再度お試しください。'));saveButton.disabled=false;saveButton.textContent=old;}
      });
    }
  };

  new MutationObserver(ensureSaveAction).observe(preview,{childList:true,subtree:true});
  ensureSaveAction();
  document.documentElement.dataset.taskRoughInputSave='ready';
}catch{document.documentElement.dataset.taskRoughInputSave='error';}
})();
