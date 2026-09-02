(()=>{
'use strict';
try{
  const config=JSON.parse(document.getElementById('recurringConfig')?.textContent||'{}'),f=document.getElementById('recForm'),csrf=String(config.csrf||''),today=String(config.today||''),heading=document.getElementById('recHeading'),submit=document.getElementById('recSubmit'),cancel=document.getElementById('recCancel'),status=document.getElementById('recStatus'),recCalendarColorCustom=document.getElementById('recCalendarColorCustom');
  if(status)status.textContent='';
  const q=n=>f.querySelector('[name="'+n+'"]'),setVal=(name,v)=>{const e=q(name);if(!e)return;if(name==='calendar_color'&&v&&![...e.options].some(o=>o.value===v)){const o=new Option('カスタム '+v,v,true,true);o.dataset.customColor='1';e.add(o,0);}e.value=v??'';if(name==='calendar_color'&&recCalendarColorCustom&&/^#[0-9a-f]{6}$/i.test(String(v||'')))recCalendarColorCustom.value=String(v).toLowerCase();};
  const calendarColorSelect=q('calendar_color');
  const syncCustomColorFromSelect=()=>{const value=String(calendarColorSelect?.value||'').toLowerCase();if(recCalendarColorCustom&&/^#[0-9a-f]{6}$/.test(value))recCalendarColorCustom.value=value;};
  const syncSelectFromCustomColor=()=>{if(!calendarColorSelect||!recCalendarColorCustom)return;const value=String(recCalendarColorCustom.value||'').toLowerCase();if(!/^#[0-9a-f]{6}$/.test(value))return;let option=[...calendarColorSelect.options].find(entry=>String(entry.value||'').toLowerCase()===value);if(!option){option=document.createElement('option');option.value=value;option.textContent=`カスタム ${value}`;option.dataset.customColor='1';calendarColorSelect.prepend(option);}else{for(const entry of [...calendarColorSelect.options])if(entry.dataset.customColor==='1'&&entry!==option)entry.remove();}calendarColorSelect.value=value;};
  calendarColorSelect?.addEventListener('change',syncCustomColorFromSelect);
  recCalendarColorCustom?.addEventListener('input',syncSelectFromCustomColor);
  syncCustomColorFromSelect();
  function refreshRecurringFields(){
    const type=String(q('recurrence_type')?.value||'DAILY');
    document.querySelectorAll('[data-rec-show]').forEach(el=>{const allowed=String(el.dataset.recShow||'').split(',');el.style.display=allowed.includes(type)?'block':'none';});
    const allDay=Boolean(q('all_day')?.checked);document.querySelectorAll('.rec-time-fields').forEach(el=>el.style.display=allDay?'none':'grid');
    const enabled=Boolean(q('family_log_enabled')?.checked),logFields=document.getElementById('recFamilyLogFields');if(logFields)logFields.style.display=enabled?'block':'none';const subject=q('family_log_subject_id');if(subject)subject.disabled=enabled&&String(q('family_log_type')?.value||'')==='HOUSEWORK';
    const cal=Boolean(q('calendar_visible')?.checked);const color=document.getElementById('recCalendarColorWrap');if(color)color.style.display=cal?'block':'none';
  }
  function resetChildren(){const sr=document.getElementById('recShopRows'),ir=document.getElementById('recItemRows');sr.innerHTML='<div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div>';ir.innerHTML='<div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div>';document.getElementById('recShopBox').style.display='none';document.getElementById('recItemBox').style.display='none';}
  const editScopeWrap=document.getElementById('recEditScope'),editScope=document.getElementById('recEditScopeSelect'),effectiveDateWrap=document.getElementById('recEffectiveDateWrap');
  function refreshEditScope(){if(effectiveDateWrap)effectiveDateWrap.style.display=editScope?.value==='future'?'block':'none';}
  editScope?.addEventListener('change',refreshEditScope);
  function resetForm(){f.reset();setVal('action','create');setVal('id','');setVal('start_date',today);setVal('interval_value',1);setVal('business_day_ordinal',1);setVal('effective_date',today);if(editScope)editScope.value='all';if(editScopeWrap)editScopeWrap.style.display='none';refreshEditScope();f.querySelectorAll('[name=week_numbers]').forEach(x=>x.checked=false);heading.textContent='定期タスクを作成';submit.textContent='定期タスクを作成';cancel.style.display='none';status.textContent='';f.querySelectorAll('[name=weekdays]').forEach(x=>x.checked=false);resetChildren();syncCustomColorFromSelect();refreshRecurringFields();}
  document.getElementById('recShopToggle').onclick=()=>{const b=document.getElementById('recShopBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('recItemToggle').onclick=()=>{const b=document.getElementById('recItemBox');b.style.display=b.style.display==='none'?'block':'none'};
  document.getElementById('recAddShop').onclick=()=>{const d=document.createElement('div');d.className='product-row';d.innerHTML='<input name="shopping_name[]" placeholder="商品名"><input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）">';document.getElementById('recShopRows').appendChild(d)};
  document.getElementById('recAddItem').onclick=()=>{const d=document.createElement('div');d.className='item-entry';d.innerHTML='<input name="item_name[]" placeholder="持ち物名">';document.getElementById('recItemRows').appendChild(d)};
  q('recurrence_type')?.addEventListener('change',refreshRecurringFields);q('all_day')?.addEventListener('change',refreshRecurringFields);q('calendar_visible')?.addEventListener('change',refreshRecurringFields);q('family_log_enabled')?.addEventListener('change',refreshRecurringFields);q('family_log_type')?.addEventListener('change',refreshRecurringFields);refreshRecurringFields();
  submit.addEventListener('click',()=>{if(status&&!submit.disabled)status.textContent='入力内容を確認しています…';});
  f.addEventListener('submit',async e=>{
    // JSが利用できない場合はHTML form POSTへそのままフォールバックする。
    if(typeof fetch!=='function'||typeof FormData==='undefined')return;
    e.preventDefault();
    const type=String(q('recurrence_type')?.value||'DAILY');
    const title=String(q('title')?.value||'').trim();
    const startDate=String(q('start_date')?.value||'').trim();
    if(!title){status.textContent='';alert('タイトルを入力してください。');q('title')?.focus();return}
    if(!startDate){status.textContent='';alert('開始日を入力してください。');q('start_date')?.focus();return}
    const weekdays=[...f.querySelectorAll('[name=weekdays]:checked')].map(x=>Number(x.value));
    const weekNumbers=[...f.querySelectorAll('[name=week_numbers]:checked')].map(x=>Number(x.value));
    const monthdays=String(q('monthdays')?.value||'').split(',').map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>=1&&x<=31);
    if((type==='WEEKLY'||type==='INTERVAL_WEEKS'||type==='MONTHLY_WEEKDAY')&&!weekdays.length){status.textContent='';alert('曜日を1つ以上選択してください。');return}
    if(type==='MONTHLY_WEEKDAY'&&!weekNumbers.length){status.textContent='';alert('第1〜第5週を1つ以上選択してください。');return}
    if(type==='MONTHLY_DAY'&&!monthdays.length){status.textContent='';alert('毎月指定日を1つ以上入力してください。');return}
    const b=Object.fromEntries(new FormData(f));
    b.csrf=csrf;b.weekdays=weekdays;b.week_numbers=weekNumbers;b.monthdays=monthdays;
    b.assignees=[...f.querySelectorAll('[name=assignees]:checked')].map(x=>Number(x.value));
    const shopNames=[...f.querySelectorAll('[name="shopping_name[]"]')],shopQty=[...f.querySelectorAll('[name="shopping_quantity[]"]')],shopUrl=[...f.querySelectorAll('[name="shopping_url[]"]')];
    b.shopping=shopNames.map((x,i)=>({name:x.value.trim(),quantity:shopQty[i]?.value.trim()||'1',url:shopUrl[i]?.value.trim()||'',category:q('shopping_category')?.value||''})).filter(x=>x.name);
    b.items=[...f.querySelectorAll('[name="item_name[]"]')].map(x=>x.value.trim()).filter(Boolean);
    b.family_log_enabled=Boolean(q('family_log_enabled')?.checked);b.shopping_category=q('shopping_category')?.value||'';b.all_day=Boolean(q('all_day')?.checked);b.calendar_visible=Boolean(q('calendar_visible')?.checked);b.calendar_color=q('calendar_color')?.value||'#7c3aed';
    submit.disabled=true;status.textContent='Cloudflareへ送信しています…';
    try{
      const controller=typeof AbortController!=='undefined'?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),15000):null;
      const r=await fetch('/app/recurring.php',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json','x-familytodo-action':'recurring-save'},body:JSON.stringify(b),signal:controller?.signal});
      if(timer)clearTimeout(timer);
      const d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした（HTTP '+r.status+'）'}));
      if(!r.ok||!d.ok)throw new Error(d.error||'保存に失敗しました');
      status.textContent='保存しました。画面を更新します…';location.href='/app/recurring.php?saved=1';
    }catch(err){
      status.textContent='';
      if(err?.name==='AbortError')alert('通信が15秒以内に完了しませんでした。通信状態を確認して再度お試しください。');
      else alert(err?.message||String(err));
    }finally{submit.disabled=false}
  });
  document.querySelectorAll('.rec-edit').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.rule);setVal('action','update');setVal('id',d.id);if(editScopeWrap)editScopeWrap.style.display='block';if(editScope)editScope.value='all';setVal('effective_date',today);refreshEditScope();setVal('title',d.title);setVal('description',d.description);setVal('recurrence_type',d.recurrence_type);setVal('interval_value',d.interval_value);setVal('start_date',d.start_date);setVal('end_date',d.end_date);setVal('business_day_ordinal',d.business_day_ordinal);f.querySelectorAll('[name=week_numbers]').forEach(x=>x.checked=d.week_numbers.includes(Number(x.value)));setVal('monthdays',d.monthdays.join(','));setVal('start_time',d.start_time);setVal('end_time',d.end_time);setVal('location',d.location);setVal('completion_mode',d.completion_mode);setVal('calendar_color',d.calendar_color);f.querySelectorAll('[name=assignees]').forEach(x=>x.checked=d.assignees.includes(Number(x.value)));q('all_day').checked=d.all_day;q('calendar_visible').checked=d.calendar_visible;f.querySelectorAll('[name=weekdays]').forEach(x=>x.checked=d.weekdays.includes(Number(x.value)));resetChildren();const sr=document.getElementById('recShopRows'),ir=document.getElementById('recItemRows');if(Array.isArray(d.shopping)&&d.shopping.length){sr.innerHTML='';d.shopping.forEach(v=>{const row=document.createElement('div');row.className='product-row';const name=document.createElement('input');name.name='shopping_name[]';name.placeholder='商品名';name.value=v.name||'';const qty=document.createElement('input');qty.name='shopping_quantity[]';qty.placeholder='数量';qty.value=v.quantity||'1';const url=document.createElement('input');url.name='shopping_url[]';url.type='url';url.placeholder='URL（任意）';url.value=v.url||'';row.append(name,qty,url);sr.appendChild(row)});setVal('shopping_category',d.shopping[0]?.category||'');document.getElementById('recShopBox').style.display='block';}if(Array.isArray(d.items)&&d.items.length){ir.innerHTML='';d.items.forEach(v=>{const row=document.createElement('div');row.className='item-entry';const name=document.createElement('input');name.name='item_name[]';name.placeholder='持ち物名';name.value=v||'';row.appendChild(name);ir.appendChild(row)});document.getElementById('recItemBox').style.display='block';}const ft=d.family_log_template||null;q('family_log_enabled').checked=Boolean(ft);setVal('family_log_subject_id',ft?.subject_id||'');setVal('family_log_type',ft?.log_type||'MEMO');setVal('family_log_detail_code',ft?.detail_code||'');setVal('family_log_amount',ft?.amount??'');setVal('family_log_unit',ft?.unit||'');setVal('family_log_duration_minutes',ft?.duration_minutes??'');setVal('family_log_value_text',ft?.value_text||'');setVal('family_log_note',ft?.note||'');heading.textContent='定期タスクを編集';submit.textContent='変更を保存';cancel.style.display='inline-block';status.textContent='';refreshRecurringFields();window.scrollTo({top:0,behavior:'smooth'});});
  cancel.onclick=resetForm;
  document.querySelectorAll('.rec-toggle-form').forEach(form=>form.addEventListener('submit',async e=>{if(typeof fetch!=='function')return;e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{const fd=new FormData(form);const payload=Object.fromEntries(fd);payload.active=String(payload.active)==='1';const r=await fetch('/app/recurring.php',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした'}));if(!r.ok||!d.ok)throw new Error(d.error||'更新に失敗しました');location.reload();}catch(err){alert(err?.message||String(err));b.disabled=false;}}));
  document.querySelectorAll('.rec-delete-form').forEach(form=>form.addEventListener('submit',async e=>{if(!confirm('この定期タスクを削除しますか？'+String.fromCharCode(10)+'過去の発生日記録も削除されます。')){e.preventDefault();return;}if(typeof fetch!=='function')return;e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{const payload=Object.fromEntries(new FormData(form));const r=await fetch('/app/recurring.php',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした'}));if(!r.ok||!d.ok)throw new Error(d.error||'削除に失敗しました');location.reload();}catch(err){alert(err?.message||String(err));b.disabled=false;}}));
  const autoEdit=Number(config.autoEditRuleId||0);if(autoEdit){const button=[...document.querySelectorAll('.rec-edit')].find(x=>Number(JSON.parse(x.dataset.rule||'{}').id)===autoEdit);button?.click();}
  document.documentElement.dataset.recurringJs='ready';
}catch(err){
  document.documentElement.dataset.recurringJs='error';
  console.error('[Family TODO LINE] recurring controller',err);
}
})();
