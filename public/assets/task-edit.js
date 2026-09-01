(() => {
'use strict';
try{
  const f=document.getElementById('taskEditForm');if(!f)return;
  const editDate=document.getElementById('editTaskDate'),editEndDate=document.getElementById('editTaskEndDate'),editNoDate=document.getElementById('editNoDate'),editAllDay=document.getElementById('editAllDay'),editTimeFields=document.getElementById('editTimeFields'),editCalendarVisible=document.getElementById('editCalendarVisible'),editCalendarColorWrap=document.getElementById('editCalendarColorWrap'),editIsEvent=document.getElementById('editIsEvent'),editIsPrivate=document.getElementById('editIsPrivate'),assignees=[...f.querySelectorAll('[name=assignees]')];
  const importedColorNames=new Map([
    ['#f35f8c','ローズピンク（TimeTree）'],
    ['#2ecc87','エメラルド（TimeTree）'],
    ['#47b2f7','スカイブルー（TimeTree）'],
    ['#b38bdc','ラベンダー（TimeTree）'],
    ['#fdc02d','アンバー（TimeTree）'],
    ['#fb7f77','コーラル（TimeTree）'],
  ]);
  const colorSelect=f.querySelector('[name=calendar_color]');
  if(colorSelect){for(const option of colorSelect.options){const name=importedColorNames.get(String(option.value||'').toLowerCase());if(name)option.textContent=name;}}
  const syncEditDate=()=>{editDate.disabled=editNoDate.checked;if(editEndDate)editEndDate.disabled=editNoDate.checked;if(editNoDate.checked){editDate.value='';if(editEndDate)editEndDate.value='';f.querySelectorAll('[name=start_time],[name=end_time]').forEach(x=>x.value='');}if(editTimeFields)editTimeFields.style.display=(!editNoDate.checked&&!editAllDay.checked)?'grid':'none';};
  const syncKind=()=>{if(editIsEvent?.checked){editNoDate.checked=false;editNoDate.disabled=true;}else{editNoDate.disabled=false;}if(editIsPrivate)editIsPrivate.disabled=false;assignees.forEach(x=>{x.disabled=Boolean(editIsPrivate?.checked);if(editIsPrivate?.checked)x.checked=false;});syncEditDate();};
  const syncEditCalendar=()=>{if(editCalendarColorWrap)editCalendarColorWrap.style.display=editCalendarVisible.checked?'block':'none'};
  const validateTaskRange=()=>{if(editNoDate.checked)return '';const start=String(editDate.value||''),end=String(editEndDate?.value||start);if(start&&end&&end<start)return '終了日は開始日以降にしてください。';if(!editAllDay.checked){const st=String(f.elements.start_time?.value||''),et=String(f.elements.end_time?.value||'');if(start&&end&&st&&et&&`${end}T${et}`<`${start}T${st}`)return '終了日時は開始日時以降にしてください。';}return '';};
  editNoDate.onchange=syncEditDate;editAllDay.onchange=syncEditDate;if(editIsEvent)editIsEvent.onchange=syncKind;if(editIsPrivate)editIsPrivate.onchange=syncKind;editCalendarVisible.onchange=syncEditCalendar;syncKind();syncEditCalendar();
  document.getElementById('shopToggle').onclick=()=>{const b=document.getElementById('shopBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('itemToggle').onclick=()=>{const b=document.getElementById('itemBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('addShopRow').onclick=()=>{const d=document.createElement('div');d.className='product-row task-child-row';d.innerHTML='<input type="hidden" name="shopping_id[]" value="0"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input name="shopping_category[]" list="taskShopCategories" maxlength="255" placeholder="カテゴリー"><input type="url" name="shopping_url[]" placeholder="URL（任意）"><button type="button" class="btn gray small remove-child">×</button>';document.getElementById('shopRows').appendChild(d)};
  document.getElementById('addItemRow').onclick=()=>{const d=document.createElement('div');d.className='item-entry task-child-row';d.innerHTML='<input type="hidden" name="item_id[]" value="0"><input name="item_name[]" placeholder="持ち物名"><button type="button" class="btn gray small remove-child">×</button>';document.getElementById('itemRows').appendChild(d)};
  document.addEventListener('click',e=>{const b=e.target.closest?.('.remove-child');if(b)b.closest('.task-child-row')?.remove()});
  f.onsubmit=async e=>{e.preventDefault();const rangeError=validateTaskRange();if(rangeError){alert(rangeError);return;}const fd=new FormData(f);const b={csrf:fd.get('csrf'),title:fd.get('title'),is_event:editIsEvent?.checked||false,is_private:editIsPrivate?.checked||false,date:fd.get('date'),end_date:fd.get('end_date'),no_date:editNoDate.checked,start_time:fd.get('start_time'),end_time:fd.get('end_time'),location:fd.get('location'),description:fd.get('description'),all_day:fd.get('all_day')==='on',calendar_visible:fd.get('calendar_visible')==='on',calendar_color:fd.get('calendar_color'),reminder_at:fd.get('reminder_at'),shopping_category:fd.get('shopping_category'),assignees:[...f.querySelectorAll('[name="assignees"]:checked')].map(x=>Number(x.value)),shopping:[...f.querySelectorAll('[name="shopping_name[]"]')].map((x,j)=>({id:Number(f.querySelectorAll('[name="shopping_id[]"]')[j]?.value||0),name:x.value.trim(),quantity:f.querySelectorAll('[name="shopping_quantity[]"]')[j]?.value.trim()||'1',category:f.querySelectorAll('[name="shopping_category[]"]')[j]?.value.trim()||'',url:f.querySelectorAll('[name="shopping_url[]"]')[j]?.value.trim()||''})).filter(x=>x.name),items:[...f.querySelectorAll('[name="item_name[]"]')].map((x,j)=>({id:Number(f.querySelectorAll('[name="item_id[]"]')[j]?.value||0),name:x.value.trim()})).filter(x=>x.name)};const r=await fetch(location.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(r.redirected)location.href=r.url;else{const d=await r.json().catch(()=>null);if(d?.error)alert(d.error);else location.reload();}};
  document.documentElement.dataset.taskEditJs='ready';
}catch(e){document.documentElement.dataset.taskEditJs='error';console.error('[task-edit] init',e);}
})();
