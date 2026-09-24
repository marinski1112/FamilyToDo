(() => {
'use strict';
try{
  const f=document.getElementById('taskEditForm');if(!f)return;
  const editDate=document.getElementById('editTaskDate'),editEndDate=document.getElementById('editTaskEndDate'),editNoDate=document.getElementById('editNoDate'),editAllDay=document.getElementById('editAllDay'),editTimeFields=document.getElementById('editTimeFields'),editCalendarVisible=document.getElementById('editCalendarVisible'),editCalendarColorWrap=document.getElementById('editCalendarColorWrap'),editCalendarColorCustom=document.getElementById('editCalendarColorCustom'),editIsEvent=document.getElementById('editIsEvent'),editIsPrivate=document.getElementById('editIsPrivate');
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
  const syncKind=()=>{const calendarControls=document.getElementById('editCalendarControls');if(calendarControls)calendarControls.hidden=!editIsEvent?.checked;if(editIsEvent?.checked){editNoDate.checked=false;editNoDate.disabled=true;}else{editNoDate.disabled=false;}if(editIsPrivate)editIsPrivate.disabled=false;syncEditDate();};
  const syncEditCalendar=()=>{if(editCalendarColorWrap)editCalendarColorWrap.style.display=editCalendarVisible.checked?'block':'none'};
  const validateTaskRange=()=>{if(editNoDate.checked)return '';const start=String(editDate.value||''),end=String(editEndDate?.value||start);if(start&&end&&end<start)return '終了日は開始日以降にしてください。';if(!editAllDay.checked){const st=String(f.elements.start_time?.value||''),et=String(f.elements.end_time?.value||'');if(start&&end&&st&&et&&`${end}T${et}`<`${start}T${st}`)return '終了日時は開始日時以降にしてください。';}return '';};
  editNoDate.onchange=syncEditDate;editAllDay.onchange=syncEditDate;if(editIsEvent)editIsEvent.onchange=()=>{syncKind();const add=document.getElementById('childTaskAddDetails');if(add)add.hidden=editIsEvent.checked;};if(editIsPrivate)editIsPrivate.onchange=syncKind;editCalendarVisible.onchange=syncEditCalendar;syncKind();syncEditCalendar();

  const renderChildSection=()=>{
    let card=document.getElementById('taskChildTaskCard');
    if(!card){card=document.createElement('div');card.className='sub-card';card.id='taskChildTaskCard';f.querySelector('button[type=submit]')?.before(card);}
    if(!childState.loaded){card.innerHTML='<p class="small">子タスクを読み込んでいます…</p>';return;}
    const children=Array.isArray(childState.children)?childState.children:[];
    const rows=children.map(child=>`<div class="row task-child-task-row"><div><strong class="${child.status==='completed'?'done':''}">${esc(child.title)}</strong><div class="meta">${[child.dueDate?`期限 ${child.dueDate}${child.dueTime?' '+child.dueTime:''}`:'期限なし',''].map(esc).join(' ・ ')}</div></div><div><a class="btn gray small" href="/task/view.php?id=${Number(child.id)}">詳細</a>${child.canEdit?` <a class="btn gray small" href="/task/edit.php?id=${Number(child.id)}">編集</a>`:''}</div></div>`).join('');
    const persistedPrivate=childState.parentVisibility==='PRIVATE';
    const privacyHint=persistedPrivate?'<p class="small">🔒 子タスクも自分専用になります。</p>':'';
    const addHtml=childState.canAddChildren&&!editIsEvent?.checked?`<details id="childTaskAddDetails"><summary class="section-button">＋ 子タスクを追加</summary><div class="compact-form"><label>タイトル<input id="childTaskTitle" maxlength="255" placeholder="子タスク"></label><div class="date-option-row"><label>期限<input id="childTaskDate" type="date"></label><label>時刻<input id="childTaskTime" type="time"></label></div>${privacyHint}<button type="button" class="btn" id="childTaskCreate">子タスクを作成</button><p class="small">子タスクは独立して完了できます。親タスクの完了では自動完了しません。</p></div></details>`:editIsEvent?.checked?'':'<p class="small">このタスク自体が子タスクのため、さらに子タスクは追加できません。</p>';
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
    const card=document.getElementById('taskChildTaskCard'),button=card?.querySelector('#childTaskCreate'),title=String(card?.querySelector('#childTaskTitle')?.value||'').trim(),dueDate=String(card?.querySelector('#childTaskDate')?.value||''),dueTime=String(card?.querySelector('#childTaskTime')?.value||''),completion='ANY';
    if(!title){alert('子タスクのタイトルを入力してください。');return;}if(dueTime&&!dueDate){alert('時刻を指定する場合は期限日も指定してください。');return;}
    const currentVisibility=editIsPrivate?.checked?'PRIVATE':'FAMILY';if(currentVisibility!==childState.parentVisibility){alert('親タスクの公開範囲を変更した場合は、先に親タスクを保存してから子タスクを追加してください。');return;}
    const body={csrf,title,description:'',is_event:false,is_private:childState.parentVisibility==='PRIVATE',dateOnly:dueDate,endDateOnly:dueDate,noDate:!dueDate,allDay:!dueTime,startTime:dueTime,endTime:'',location:'',calendar_visible:true,completion_mode:completion,reminderAt:'',parent_task_id:parentId};
    button.disabled=true;const old=button.textContent;button.textContent='作成中…';
    try{const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('child create failed');await loadChildren();const box=document.getElementById('childTaskBox');if(box)box.style.display='block';}catch{alert('子タスクを作成できませんでした。');button.disabled=false;button.textContent=old;}
  }
  renderChildSection();loadChildren();

  f.onsubmit=async e=>{e.preventDefault();const rangeError=validateTaskRange();if(rangeError){alert(rangeError);return;}if(childState.loaded&&childState.children.length&&((editIsPrivate?.checked?'PRIVATE':'FAMILY')!==childState.parentVisibility)){alert('子タスクがある親タスクの公開範囲は、この画面では変更できません。子タスクとの公開範囲不一致を防ぐため、先に子タスクを整理してください。');return;}const fd=new FormData(f);const b={csrf:fd.get('csrf'),title:fd.get('title'),is_event:editIsEvent?.checked||false,is_private:editIsPrivate?.checked||false,date:fd.get('date'),end_date:fd.get('end_date'),no_date:editNoDate.checked,start_time:fd.get('start_time'),end_time:fd.get('end_time'),location:fd.get('location'),description:fd.get('description'),all_day:fd.get('all_day')==='on',calendar_visible:!editIsEvent?.checked||fd.get('calendar_visible')==='on',calendar_color:fd.get('calendar_color'),reminder_at:fd.get('reminder_at')};try{const r=await fetch(location.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(r.redirected){location.href=r.url;return;}const d=await r.json().catch(()=>null);if(!r.ok||d?.error)throw new Error('更新に失敗しました');location.reload();}catch(_err){alert('更新に失敗しました');}};
  document.documentElement.dataset.taskEditJs='ready';
}catch(_err){document.documentElement.dataset.taskEditJs='error';}
})();
