(()=>{
  'use strict';
  const grid=document.querySelector('.calendar-grid'),payload=document.getElementById('calendarPayload');if(!grid||!payload)return;
  let csrf='';try{csrf=String(JSON.parse(payload.textContent||'{}').csrf||'');}catch{}
  const dateOk=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const dialog=document.createElement('div');dialog.className='calendar-decoration-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','日付を飾る');
  dialog.innerHTML='<div class="calendar-decoration-card"><button type="button" class="calendar-decoration-close" aria-label="閉じる">×</button><h3>日付を飾る</h3><p class="calendar-decoration-date"></p><div class="calendar-decoration-tabs"><button type="button" data-action="stamp">スタンプを選ぶ</button><button type="button" data-action="sticker">背景ステッカーを選ぶ</button></div><section class="calendar-decoration-stickers" hidden><label>公開範囲 <select><option value="FAMILY">家族共有</option><option value="PRIVATE">自分専用</option></select></label><div class="calendar-decoration-options"></div><button type="button" class="calendar-decoration-remove">この背景を外す</button><p role="status" class="calendar-decoration-status"></p></section></div>';
  document.body.appendChild(dialog);
  const close=()=>{dialog.hidden=true;targetDate='';};
  dialog.querySelector('.calendar-decoration-close').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.hidden)close();});
  const section=dialog.querySelector('.calendar-decoration-stickers'),options=dialog.querySelector('.calendar-decoration-options'),scope=section.querySelector('select'),status=section.querySelector('.calendar-decoration-status');
  let targetDate='',days=[],assets=[],busy=false,serial=0;
  const request=async(method,body)=>{
    const response=await fetch('/api/calendar-stickers',{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({...body,csrf})});
    const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error('STICKER_FAILED');return data;
  };
  const render=()=>{
    for(const cell of grid.querySelectorAll('.calendar-cell[data-date]')){
      cell.querySelector('.calendar-day-sticker')?.remove();cell.classList.remove('has-day-sticker');
      const date=String(cell.dataset.date||''),day=days.filter(row=>row.date===date).at(-1);if(!day)continue;
      const img=document.createElement('img');img.className='calendar-day-sticker';img.src=day.url;img.alt='';img.draggable=false;cell.prepend(img);cell.classList.add('has-day-sticker');
    }
  };
  const load=async()=>{
    const dates=[...grid.querySelectorAll('.calendar-cell[data-date]')].map(cell=>cell.dataset.date).filter(dateOk).sort();if(!dates.length)return;
    const run=++serial,response=await fetch('/api/calendar-stickers?from='+encodeURIComponent(dates[0])+'&to='+encodeURIComponent(dates.at(-1)),{credentials:'same-origin',cache:'no-store'});
    const data=await response.json().catch(()=>null);if(run!==serial||!response.ok||!data?.ok)return;
    days=Array.isArray(data.days)?data.days:[];assets=Array.isArray(data.options)?data.options:[];render();
  };
  const showOptions=()=>{
    options.replaceChildren();status.textContent='';
    for(const asset of assets){
      const button=document.createElement('button');button.type='button';button.className='calendar-decoration-option';button.setAttribute('aria-label',asset.name+'を背景に設定');
      const img=document.createElement('img');img.src=asset.url;img.alt='';const name=document.createElement('span');name.textContent=asset.name;button.append(img,name);
      button.addEventListener('click',async()=>{if(busy)return;busy=true;status.textContent='保存中…';try{await request('POST',{date:targetDate,visibilityScope:scope.value,assetId:asset.id});await load();close();}catch{status.textContent='背景を保存できませんでした。';}finally{busy=false;}});
      options.appendChild(button);
    }
    if(!assets.length)options.textContent='登録済みステッカーがありません。管理画面で登録できます。';
    const selected=days.find(day=>day.date===targetDate&&day.scope===scope.value);
    section.querySelector('.calendar-decoration-remove').hidden=!selected?.canRemove;
  };
  scope.addEventListener('change',showOptions);
  dialog.querySelector('.calendar-decoration-remove').addEventListener('click',async()=>{if(busy)return;busy=true;status.textContent='削除中…';try{await request('DELETE',{date:targetDate,visibilityScope:scope.value});await load();close();}catch{status.textContent='背景を外せませんでした。';}finally{busy=false;}});
  dialog.querySelector('[data-action="stamp"]').addEventListener('click',()=>{const date=targetDate;close();window.familyCalendarOpenStampPicker?.(date);});
  dialog.querySelector('[data-action="sticker"]').addEventListener('click',()=>{section.hidden=false;showOptions();});
  const open=date=>{if(!csrf||!dateOk(date))return;targetDate=date;section.hidden=true;dialog.querySelector('.calendar-decoration-date').textContent=date;dialog.hidden=false;dialog.querySelector('[data-action="stamp"]').focus();};
  let timer=0,startX=0,startY=0,held=false;
  const cancel=()=>{clearTimeout(timer);timer=0;};
  grid.addEventListener('pointerdown',event=>{
    cancel();if(event.button!==0||event.target.closest('a,.calendar-stamp-thumb'))return;
    const cell=event.target.closest('.calendar-cell[data-date]');if(!cell)return;
    held=false;startX=event.clientX;startY=event.clientY;
    timer=setTimeout(()=>{held=true;window.calendarDecorationLongPressUntil=Date.now()+950;open(cell.dataset.date);},550);
  });
  grid.addEventListener('pointermove',event=>{if(Math.abs(event.clientX-startX)>12||Math.abs(event.clientY-startY)>12)cancel();});
  grid.addEventListener('pointerup',()=>{if(held)window.calendarDecorationLongPressUntil=Date.now()+950;cancel();});grid.addEventListener('pointercancel',cancel);grid.addEventListener('pointerleave',cancel);
  grid.addEventListener('touchend',()=>{if(held)window.calendarDecorationLongPressUntil=Date.now()+950;},true);
  grid.addEventListener('contextmenu',event=>{const cell=event.target.closest('.calendar-cell[data-date]');if(!cell)return;event.preventDefault();cancel();window.calendarDecorationLongPressUntil=Date.now()+950;if(!held)open(cell.dataset.date);});
  new MutationObserver(records=>{if(records.some(record=>record.target===grid))load().catch(()=>{});}).observe(grid,{childList:true});
  load().catch(()=>{});
})();
