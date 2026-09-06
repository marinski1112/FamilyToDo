(() => {
'use strict';
try{
  const f=document.getElementById('taskEditForm');if(!f)return;
  const editDate=document.getElementById('editTaskDate'),editEndDate=document.getElementById('editTaskEndDate'),editNoDate=document.getElementById('editNoDate'),editAllDay=document.getElementById('editAllDay'),editTimeFields=document.getElementById('editTimeFields'),editCalendarVisible=document.getElementById('editCalendarVisible'),editCalendarColorWrap=document.getElementById('editCalendarColorWrap'),editCalendarColorCustom=document.getElementById('editCalendarColorCustom'),editIsEvent=document.getElementById('editIsEvent'),editIsPrivate=document.getElementById('editIsPrivate'),assignees=[...f.querySelectorAll('[name=assignees]')];
  const parentId=Number(new URL(location.href).searchParams.get('id')||0),csrf=String(f.elements.csrf?.value||'');
  let childState={loaded:false,parentVisibility:'FAMILY',canAddChildren:false,children:[]};
  const importedColorNames=new Map([
    ['#f35f8c','ローズピンク（TimeTree）'],
    ['#2ecc87','エメラルド（TimeTree）'],
    ['#47b2f7','スカイブルー（TimeTree）'],
    ['#b38bdc','ラベンダー（TimeTree）'],
    ['#fdc02d','アンバー（TimeTree）'],
    ['#fb7f77','コーラル（TimeTree）'],
  ]);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colorSelect=f.querySelector('[name=calendar_color]');
  if(colorSelect){for(const option of colorSelect.options){const name=importedColorNames.get(String(option.value||'').toLowerCase());if(name)option.textContent=name;}}
  const syncCustomColorFromSelect=()=>{const value=String(colorSelect?.value||'').toLowerCase();if(editCalendarColorCustom&&/^#[0-9a-f]{6}$/.test(value))editCalendarColorCustom.value=value;};
  const syncSelectFromCustomColor=()=>{if(!colorSelect||!editCalendarColorCustom)return;const value=String(editCalendarColorCustom.value||'').toLowerCase();if(!/^#[0-9a-f]{6}$/.test(value))return;let option=[...colorSelect.options].find(entry=>String(entry.value||'').toLowerCase()===value);if(!option){option=document.createElement('option');option.value=value;option.textContent=`カスタム ${value}`;option.dataset.customColor='1';colorSelect.prepend(option);}else{for(const entry of [...colorSelect.options])if(entry.dataset.customColor==='1'&&entry!==option)entry.remove();}colorSelect.value=value;};
  if(colorSelect)colorSelect.addEventListener('change',syncCustomColorFromSelect);
  if(editCalendarColorCustom)editCalendarColorCustom.addEventListener('input',syncSelectFromCustomColor);
  syncCustomColorFromSelect();
  const syncEditDate=()=>{editDate.disabled=editNoDate.checked;if(editEndDate)editEndDate.disabled=editNoDate.checked;if(editNoDate.checked){editDate.value='';if(editEndDate)editEndDate.value='';f.querySelectorAll('[name=start_time],[name=end_time]').forEach(x=>x.value='');}if(editTimeFields)editTimeFields.style.display=(!editNoDate.checked&&!editAllDay.checked)?'grid':'none';};
  const syncKind=()=>{if(editIsEvent?.checked){editNoDate.checked=false;editNoDate.disabled=true;}else{editNoDate.disabled=false;}if(editIsPrivate)editIsPrivate.disabled=false;assignees.forEach(x=>{x.disabled=Boolean(editIsPrivate?.checked);if(editIsPrivate?.checked)x.checked=false;});syncEditDate();};
  const syncEditCalendar=()=>{if(editCalendarColorWrap)editCalendarColorWrap.style.display=editCalendarVisible.checked?'block':'none'};
  const validateTaskRange=()=>{if(editNoDate.checked)return '';const start=String(editDate.value||''),end=String(editEndDate?.value||start);if(start&&end&&end<start)return '終了日は開始日以降にしてください。';if(!editAllDay.checked){const st=String(f.elements.start_time?.value||''),et=String(f.elements.end_time?.value||'');if(start&&end&&st&&et&&`${end}T${et}`<`${start}T${st}`)return '終了日時は開始日時以降にしてください。';}return '';};
  editNoDate.onchange=syncEditDate;editAllDay.onchange=syncEditDate;if(editIsEvent)editIsEvent.onchange=syncKind;if(editIsPrivate)editIsPrivate.onchange=syncKind;editCalendarVisible.onchange=syncEditCalendar;syncKind();syncEditCalendar();

  const childAssigneeChoices=()=>assignees.map(input=>({id:Number(input.value),name:String(input.closest('label')?.textContent||'').trim(),checked:Boolean(input.checked)})).filter(x=>x.id>0&&x.name);
  const renderChildSection=()=>{
    let card=document.getElementById('taskChildTaskCard');
    if(!card){card=document.createElement('div');card.className='sub-card';card.id='taskChildTaskCard';const shopCard=document.getElementById('shopToggle')?.closest('.sub-card');if(shopCard)shopCard.before(card);else f.querySelector('button[type=submit]')?.before(card);}
    if(!childState.loaded){card.innerHTML='<p class="small">子タスクを読み込んでいます…</p>';return;}
    const children=Array.isArray(childState.children)?childState.children:[];
    const rows=children.map(child=>`<div class="row task-child-task-row"><div><strong class="${child.status==='completed'?'done':''}">${esc(child.title)}</strong><div class="meta">${[child.dueDate?`期限 ${child.dueDate}${child.dueTime?' '+child.dueTime:''}`:'期限なし',child.assignees?`担当 ${child.assignees}`:'担当なし',child.completionMode==='ALL'?'全員完了':'誰か1人で完了'].map(esc).join(' ・ ')}</div></div><div><a class="btn gray small" href="/task/view.php?id=${Number(child.id)}">詳細</a>${child.canEdit?` <a class="btn gray small" href="/task/edit.php?id=${Number(child.id)}">編集</a>`:''}</div></div>`).join('');
    const persistedPrivate=childState.parentVisibility==='PRIVATE';
    const choices=childAssigneeChoices();
    const assigneeHtml=persistedPrivate?'<p class="small">🔒 自分専用の親では、子タスクも自分専用になります。</p>':`<fieldset class="child-task-assignees"><legend>担当者</legend>${choices.map(a=>`<label class="checkrow inline-check"><input type="checkbox" value="${a.id}" ${a.checked?'checked':''}> ${esc(a.name)}</label>`).join('')}</fieldset>`;
    const addHtml=childState.canAddChildren?`<details id="childTaskAddDetails"><summary class="section-button">＋ 子タスクを追加</summary><div class="compact-form"><label>タイトル<input id="childTaskTitle" maxlength="255" placeholder="子タスク"></label><div class="date-option-row"><label>期限<input id="childTaskDate" type="date"></label><label>時刻<input id="childTaskTime" type="time"></label></div><label>完了条件<select id="childTaskCompletion"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select></label>${assigneeHtml}<button type="button" class="btn" id="childTaskCreate">子タスクを作成</button><p class="small">子タスクは独立して完了できます。親タスクの完了では自動完了しません。</p></div></details>`:'<p class="small">このタスク自体が子タスクのため、さらに子タスクは追加できません。</p>';
    card.innerHTML=`<button type="button" class="section-button" id="childTaskToggle">✅ 子タスク <span class="small">(${children.length})</span></button><div id="childTaskBox" ${children.length?'':'style="display:none"'}>${rows||'<p class="empty">子タスクはありません。</p>'}${addHtml}</div>`;
    card.querySelector('#childTaskToggle')?.addEventListener('click',()=>{const box=card.querySelector('#childTaskBox');box.style.display=box.style.display==='none'?'block':'none';});
    card.querySelector('#childTaskAddDetails')?.addEventListener('toggle',e=>{if(e.target.open){const box=card.querySelector('#childTaskBox');box.style.display='block';card.querySelector('#childTaskTitle')?.focus();}});
    card.querySelector('#childTaskCreate')?.addEventListener('click',createChildTask);
  };
  const loadChildren=async()=>{
    if(!parentId)return;
    try{const r=await fetch(`/api/task-children?parent_id=${encodeURIComponent(parentId)}`,{headers:{accept:'application/json'},cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('child load failed');childState={loaded:true,parentVisibility:String(d.parent?.visibilityScope)==='PRIVATE'?'PRIVATE':'FAMILY',canAddChildren:Boolean(d.canAddChildren),children:Array.isArray(d.children)?d.children:[]};renderChildSection();}catch{childState.loaded=true;renderChildSection();const card=document.getElementById('taskChildTaskCard');if(card)card.innerHTML='<p class="small">子タスクを読み込めませんでした。</p>';}
  };
  async function createChildTask(){
    const card=document.getElementById('taskChildTaskCard'),button=card?.querySelector('#childTaskCreate'),title=String(card?.querySelector('#childTaskTitle')?.value||'').trim(),dueDate=String(card?.querySelector('#childTaskDate')?.value||''),dueTime=String(card?.querySelector('#childTaskTime')?.value||''),completion=String(card?.querySelector('#childTaskCompletion')?.value||'ANY');
    if(!title){alert('子タスクのタイトルを入力してください。');return;}if(dueTime&&!dueDate){alert('時刻を指定する場合は期限日も指定してください。');return;}
    const currentVisibility=editIsPrivate?.checked?'PRIVATE':'FAMILY';if(currentVisibility!==childState.parentVisibility){alert('親タスクの公開範囲を変更した場合は、先に親タスクを保存してから子タスクを追加してください。');return;}
    const childAssignees=childState.parentVisibility==='PRIVATE'?[]:[...card.querySelectorAll('.child-task-assignees input[type=checkbox]:checked')].map(x=>Number(x.value)).filter(n=>Number.isInteger(n)&&n>0);
    const body={csrf,title,description:'',is_event:false,is_private:childState.parentVisibility==='PRIVATE',dateOnly:dueDate,endDateOnly:dueDate,noDate:!dueDate,allDay:!dueTime,startTime:dueTime,endTime:'',location:'',calendar_visible:Boolean(dueDate),completion_mode:completion,assignees:childAssignees,reminderAt:'',parent_task_id:parentId};
    button.disabled=true;const old=button.textContent;button.textContent='作成中…';
    try{const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('child create failed');await loadChildren();const box=document.getElementById('childTaskBox');if(box)box.style.display='block';}catch{alert('子タスクを作成できませんでした。');button.disabled=false;button.textContent=old;}
  }
  renderChildSection();loadChildren();

  document.getElementById('shopToggle').onclick=()=>{const b=document.getElementById('shopBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('itemToggle').onclick=()=>{const b=document.getElementById('itemBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('addShopRow').onclick=()=>{const d=document.createElement('div');d.className='product-row task-child-row';d.innerHTML='<input type="hidden" name="shopping_id[]" value="0"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input name="shopping_category[]" list="taskShopCategories" maxlength="255" placeholder="カテゴリー"><input type="url" name="shopping_url[]" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button>';document.getElementById('shopRows').appendChild(d)};
  document.getElementById('addItemRow').onclick=()=>{const d=document.createElement('div');d.className='item-entry task-child-row';d.innerHTML='<input type="hidden" name="item_id[]" value="0"><input name="item_name[]" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button>';document.getElementById('itemRows').appendChild(d)};
  document.addEventListener('click',e=>{const b=e.target.closest?.('.remove-child');if(b)b.closest('.task-child-row')?.remove()});
  f.onsubmit=async e=>{e.preventDefault();const rangeError=validateTaskRange();if(rangeError){alert(rangeError);return;}if(childState.loaded&&childState.children.length&&((editIsPrivate?.checked?'PRIVATE':'FAMILY')!==childState.parentVisibility)){alert('子タスクがある親タスクの公開範囲は、この画面では変更できません。子タスクとの公開範囲不一致を防ぐため、先に子タスクを整理してください。');return;}const fd=new FormData(f);const b={csrf:fd.get('csrf'),title:fd.get('title'),is_event:editIsEvent?.checked||false,is_private:editIsPrivate?.checked||false,date:fd.get('date'),end_date:fd.get('end_date'),no_date:editNoDate.checked,start_time:fd.get('start_time'),end_time:fd.get('end_time'),location:fd.get('location'),description:fd.get('description'),all_day:fd.get('all_day')==='on',calendar_visible:fd.get('calendar_visible')==='on',calendar_color:fd.get('calendar_color'),reminder_at:fd.get('reminder_at'),shopping_category:fd.get('shopping_category'),assignees:[...f.querySelectorAll('[name="assignees"]:checked')].map(x=>Number(x.value)),shopping:[...f.querySelectorAll('[name="shopping_name[]"]')].map((x,j)=>({id:Number(f.querySelectorAll('[name="shopping_id[]"]')[j]?.value||0),name:x.value.trim(),quantity:f.querySelectorAll('[name="shopping_quantity[]"]')[j]?.value.trim()||'1',category:f.querySelectorAll('[name="shopping_category[]"]')[j]?.value.trim()||'',url:f.querySelectorAll('[name="shopping_url[]"]')[j]?.value.trim()||''})).filter(x=>x.name),items:[...f.querySelectorAll('[name="item_name[]"]')].map((x,j)=>({id:Number(f.querySelectorAll('[name="item_id[]"]')[j]?.value||0),name:x.value.trim()})).filter(x=>x.name)};try{const r=await fetch(location.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(r.redirected){location.href=r.url;return;}const d=await r.json().catch(()=>null);if(!r.ok||d?.error)throw new Error('更新に失敗しました');location.reload();}catch(_err){alert('更新に失敗しました');}};
  document.documentElement.dataset.taskEditJs='ready';
}catch(_err){document.documentElement.dataset.taskEditJs='error';}
})();
