(() => {
'use strict';
try {
  let payload=JSON.parse(document.getElementById('calendarPayload')?.textContent||'{}');
  let detail=payload.detail||{},shoppingDetail=payload.shoppingDetail||{},itemDetail=payload.itemDetail||{},holidays=payload.holidays||{};
  let currentMonth=payload.month||'',currentPrev=payload.prev||'',currentNext=payload.next||'',currentView=payload.view||'all',calendarBusy=false;
  document.documentElement.dataset.calendarJs='ready';
  const compactUiScript=document.createElement('script');compactUiScript.src='/assets/calendar-mobile-ui.js?v=wave128-fix22';compactUiScript.defer=true;document.head.append(compactUiScript);
  const modal=document.getElementById('dayModal'),modalBody=document.getElementById('modalBody'),modalTitle=document.getElementById('modalTitle'),modalAdd=document.getElementById('modalAdd'),modalPrev=document.getElementById('modalPrev'),modalNext=document.getElementById('modalNext'),modalReorder=document.getElementById('modalReorder'),monthLabel=document.getElementById('monthLabel'),prevMonth=document.getElementById('prevMonth'),nextMonth=document.getElementById('nextMonth');
  let selectedDate='',reorderMode=false;
  const calendarFab=document.getElementById('calendarFab');
  if(calendarFab) calendarFab.setAttribute('href','/task/new.php?date='+(payload.today||'')+'&return=calendar');
  calendarFab?.addEventListener('click',()=>{ const href='/task/new.php?date='+(selectedDate||payload.today||'')+'&return=calendar'; calendarFab.setAttribute('href',href); });
  function shiftDate(d,days){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10);}
  function escJs(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function repairRecurringBandLinks(root){
    if(!root?.querySelectorAll)return;
    const recurringBySyntheticId=new Map();
    for(const rows of Object.values(detail)){
      if(!Array.isArray(rows))continue;
      for(const row of rows){
        const syntheticId=Number(row?.id),ruleId=Number(row?.recurrence_rule_id);
        if(syntheticId<0&&ruleId>0&&!recurringBySyntheticId.has(syntheticId))recurringBySyntheticId.set(syntheticId,row);
      }
    }
    root.querySelectorAll('a.calendar-band[data-task-id]').forEach(link=>{
      const syntheticId=Number(link.dataset.taskId||0);if(syntheticId>=0)return;
      const row=recurringBySyntheticId.get(syntheticId);if(!row)return;
      const params=new URLSearchParams({edit:String(row.recurrence_rule_id)});
      if(Number(row.recurrence_occurrence_id)>0)params.set('occurrence',String(row.recurrence_occurrence_id));
      const date=String(row.occurrence_date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(date))params.set('date',date);
      link.href='/app/recurring.php?'+params.toString();
    });
  }
  function detailHtml(d){
    const x=detail[d]||[],h=holidays[d];
    const rows=x.map(t=>{
      const time=t.start_at?String(t.start_at).slice(11,16):t.due_at?(String(t.due_at).slice(11,16)==='00:00'?'終日':String(t.due_at).slice(11,16)):'';
      const meta=[t.assignees,time,t.location].filter(Boolean).join(' ・ ');
      const isEvent=String(t.task_kind||'').toLowerCase()==='event';
      const check=isEvent?'':('<input type="checkbox" class="calendar-task-toggle" data-id="'+t.id+'" data-occurrence-id="'+(t.recurrence_occurrence_id||0)+'" data-recurrence="'+(t.recurring?'1':'0')+'" '+(t.status==='completed'?'checked':'')+'> ');
      const familyLog=t.recurring&&Number(t.family_log_template_id||0)?'<button type="button" class="btn small secondary occurrence-family-log" data-occurrence-id="'+Number(t.recurrence_occurrence_id||0)+'">🐣 記録して完了</button>':'';
      const move=!t.recurring?'<div class="calendar-reorder-controls" aria-label="並べ替え"><button type="button" class="calendar-move" data-id="'+t.id+'" data-dir="-1" aria-label="上へ">↑</button><button type="button" class="calendar-move" data-id="'+t.id+'" data-dir="1" aria-label="下へ">↓</button></div>':'';
      return '<div class="modal-row '+(!isEvent&&t.status==='completed'?'is-completed':'')+'" data-task-row="'+t.id+'"><div class="modal-row-main">'+check+'<div class="modal-task-copy"><strong><a href="'+(t.recurring?'/app/recurring.php?'+new URLSearchParams({edit:String(t.recurrence_rule_id||''),occurrence:String(t.recurrence_occurrence_id||''),date:String(t.occurrence_date||'')}):'/task/view.php?id='+encodeURIComponent(t.id))+'">'+(isEvent?'📌 ':'📝 ')+escJs(t.title)+(isEvent?' <small>(イベント)</small>':t.recurring?' <small>'+(Number(t.calendar_visible)===0?'(定期・月非表示)':'(定期)')+'</small>':'')+'</a></strong>'+(meta?'<div class="meta">'+escJs(meta)+'</div>':'')+(t.description?'<div class="modal-desc">'+escJs(t.description).replaceAll(String.fromCharCode(13),'').split(String.fromCharCode(10)).join('<br>')+'</div>':'')+'</div>'+familyLog+move+'</div></div>';
    }).join('');
    const shops=(shoppingDetail[d]||[]).map(i=>'<div class="modal-row"><div><label class="modal-check-row"><input type="checkbox" class="calendar-shop-toggle" data-id="'+i.id+'" '+(i.status==='completed'?'checked':'')+'> <strong>🛒 '+escJs(i.name)+(i.quantity&&i.quantity!=='1'?' × '+escJs(i.quantity):'')+'</strong></label></div></div>').join('');
    const carry=(itemDetail[d]||[]).map(i=>'<div class="modal-row"><div><label class="modal-check-row"><input type="checkbox" class="calendar-item-toggle" data-id="'+i.id+'" '+(i.status==='completed'?'checked':'')+'> <strong>🎒 '+escJs(i.name)+'</strong></label>'+(i.assignees?'<div class="meta">担当 '+escJs(i.assignees)+'</div>':'')+'</div></div>').join('');
    return (h?'<div class="modal-holiday">🎌 '+escJs(h)+'</div>':'')+(rows||'<div class="modal-row">この日のタスクはありません。</div>')+(carry?'<div class="modal-subhead">持ち物</div>'+carry:'')+(shops?'<div class="modal-subhead">買い物</div>'+shops:'');
  }
  function dayLabel(d){const x=new Date(d+'T12:00:00Z');const wd=['日','月','火','水','木','金','土'][x.getUTCDay()];return (x.getUTCMonth()+1)+'月'+x.getUTCDate()+'日（'+wd+'）';}
  function render(d,dir=0){
    selectedDate=d;modalTitle.textContent=dayLabel(d);if(modalBody){const update=()=>{modalBody.innerHTML=detailHtml(d);modalBody.style.transition='none';modalBody.style.transform='translateX('+(dir?(dir>0?'32px':'-32px'):'0')+')';modalBody.style.opacity=dir?'0.45':'1';void modalBody.offsetWidth;modalBody.style.transition='transform .22s cubic-bezier(.2,.8,.2,1),opacity .18s ease';modalBody.style.transform='translateX(0)';modalBody.style.opacity='1';};if(dir&&modal.classList.contains('open')){modalBody.style.transition='transform .12s ease,opacity .12s ease';modalBody.style.transform='translateX('+(dir>0?'-28px':'28px')+')';modalBody.style.opacity='0.35';setTimeout(update,115);}else update();}if(modalAdd)modalAdd.href='/task/new.php?date='+d+'&return=calendar';if(modalReorder){const normalCount=(detail[d]||[]).filter(t=>!t.recurring).length;modalReorder.style.display=normalCount>1?'inline-flex':'none';modalReorder.textContent=reorderMode?'並べ替え完了':'並べ替え';modal?.classList.toggle('calendar-reorder-mode',reorderMode&&normalCount>1);}if(modalPrev)modalPrev.setAttribute('aria-label',shiftDate(d,-1)+' の詳細');if(modalNext)modalNext.setAttribute('aria-label',shiftDate(d,1)+' の詳細');openModal();
  }
  function applyCalendarDocument(text,targetMonth,dir,openDate){const doc=new DOMParser().parseFromString(text,'text/html');const nextGrid=doc.querySelector('.calendar-grid');const payloadEl=doc.getElementById('calendarPayload');if(!nextGrid||!payloadEl)throw new Error('カレンダー情報を取得できませんでした');const nextPayload=JSON.parse(payloadEl.textContent||'{}');const gridNow=document.querySelector('.calendar-grid');if(!gridNow)throw new Error('カレンダーが見つかりません');gridNow.classList.add('month-changing');gridNow.style.transition='transform .18s cubic-bezier(.2,.8,.2,1),opacity .16s ease';gridNow.style.transform='translateX('+(dir<0?'28px':'-28px')+')';gridNow.style.opacity='0';setTimeout(()=>{gridNow.innerHTML=nextGrid.innerHTML;payload=nextPayload;detail=payload.detail||{};shoppingDetail=payload.shoppingDetail||{};itemDetail=payload.itemDetail||{};holidays=payload.holidays||{};repairRecurringBandLinks(gridNow);currentMonth=payload.month||targetMonth;currentPrev=payload.prev||currentPrev;currentNext=payload.next||currentNext;if(monthLabel)monthLabel.textContent=currentMonth.slice(0,4)+'年'+Number(currentMonth.slice(5))+'月';if(prevMonth){prevMonth.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+currentPrev;prevMonth.dataset.month=currentPrev;}if(nextMonth){nextMonth.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+currentNext;nextMonth.dataset.month=currentNext;}gridNow.style.transition='none';gridNow.style.transform='translateX('+(dir<0?'-28px':'28px')+')';void gridNow.offsetWidth;gridNow.style.transition='transform .24s cubic-bezier(.2,.8,.2,1),opacity .20s ease';gridNow.style.opacity='1';gridNow.style.transform='translateX(0)';gridNow.classList.remove('month-changing');history.replaceState(null,'','/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(currentMonth)+(openDate?'&open='+encodeURIComponent(openDate):''));if(openDate)render(openDate,dir);},170);}
  async function loadMonth(targetMonth,dir,openDate=''){if(calendarBusy||!targetMonth||targetMonth===currentMonth){if(openDate)render(openDate,dir);return;}calendarBusy=true;try{const r=await fetch('/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(targetMonth),{headers:{'accept':'text/html'},credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('月表示の取得に失敗しました');applyCalendarDocument(await r.text(),targetMonth,dir,openDate);}catch(e){location.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(targetMonth)+(openDate?'&open='+encodeURIComponent(openDate):'');}finally{setTimeout(()=>{calendarBusy=false},280);}}
  function navigateDay(days){if(!selectedDate)return;const target=shiftDate(selectedDate,days),dir=days>0?1:-1;if(payload.from&&payload.to&&(target<payload.from||target>payload.to)){loadMonth(target.slice(0,7),dir,target);return;}render(target,dir);}
  const calendarCard=document.querySelector('.calendar-card');
  repairRecurringBandLinks(document.querySelector('.calendar-grid'));
  let swipeX=0,swipeY=0,swipeActive=false,suppressCalendarClickUntil=0;
  calendarCard?.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(!e.target.closest('.calendar-grid'))return;if(e.pointerType==='mouse'&&e.button!==0)return;swipeX=e.clientX;swipeY=e.clientY;swipeActive=true;});
  calendarCard?.addEventListener('pointerup',e=>{if(e.pointerType==='touch'||!swipeActive)return;swipeActive=false;const dx=e.clientX-swipeX,dy=e.clientY-swipeY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){suppressCalendarClickUntil=Date.now()+350;loadMonth(dx<0?currentNext:currentPrev,dx<0?1:-1);}});
  calendarCard?.addEventListener('pointercancel',()=>{swipeActive=false;});
  let touchX=0,touchY=0,touchTarget=null,touchPreview=false;
  calendarCard?.addEventListener('touchstart',e=>{const t=e.changedTouches&&e.changedTouches[0];const cell=e.target.closest('.calendar-cell');if(!t||!e.target.closest('.calendar-grid'))return;touchX=t.clientX;touchY=t.clientY;touchTarget=cell;touchPreview=false;},{passive:true});
  calendarCard?.addEventListener('touchmove',e=>{const t=e.changedTouches&&e.changedTouches[0],grid=document.querySelector('.calendar-grid');if(!t||!grid||calendarBusy)return;const dx=t.clientX-touchX,dy=t.clientY-touchY;if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){touchPreview=true;const px=Math.max(-42,Math.min(42,dx*.28));grid.style.transition='none';grid.style.transform='translateX('+px+'px)';grid.style.opacity=String(Math.max(.82,1-Math.abs(px)/220));}},{passive:true});
  calendarCard?.addEventListener('touchend',e=>{const t=e.changedTouches&&e.changedTouches[0],grid=document.querySelector('.calendar-grid');if(!t)return;const dx=t.clientX-touchX,dy=t.clientY-touchY,targetCell=e.target.closest('.calendar-cell')||touchTarget;if(grid&&touchPreview){grid.style.transition='transform .14s ease,opacity .14s ease';grid.style.transform='translateX(0)';grid.style.opacity='1';}suppressCalendarClickUntil=Date.now()+420;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){setTimeout(()=>loadMonth(dx<0?currentNext:currentPrev,dx<0?1:-1),touchPreview?80:0);touchTarget=null;touchPreview=false;return;}if(Math.abs(dx)<28&&Math.abs(dy)<28&&targetCell?.dataset.date)render(targetCell.dataset.date);touchTarget=null;touchPreview=false;},{passive:true});
  calendarCard?.addEventListener('touchcancel',()=>{const grid=document.querySelector('.calendar-grid');if(grid){grid.style.transform='translateX(0)';grid.style.opacity='1';}touchTarget=null;touchPreview=false;});
  calendarCard?.addEventListener('click',e=>{if(Date.now()<suppressCalendarClickUntil)return;const cell=e.target.closest('.calendar-cell');if(cell?.dataset.date)render(cell.dataset.date);});
  prevMonth?.addEventListener('click',e=>{e.preventDefault();loadMonth(currentPrev,-1);});
  nextMonth?.addEventListener('click',e=>{e.preventDefault();loadMonth(currentNext,1);});
  function closeModal(){reorderMode=false;modal.classList.remove('open','calendar-reorder-mode');if(modalReorder)modalReorder.textContent='並べ替え完了';document.body.classList.remove('calendar-modal-open');}
  function openModal(){modal.classList.add('open');document.body.classList.add('calendar-modal-open');}
  document.getElementById('modalClose').onclick=closeModal;
  modalPrev?.addEventListener('click',()=>navigateDay(-1));
  modalNext?.addEventListener('click',()=>navigateDay(1));
  modalReorder?.addEventListener('click',()=>{reorderMode=!reorderMode;modal?.classList.toggle('calendar-reorder-mode',reorderMode);modalReorder.textContent=reorderMode?'並べ替え完了':'並べ替え';if(selectedDate&&modalBody)modalBody.innerHTML=detailHtml(selectedDate);});
  async function moveCalendarTask(id,dir){
    if(!selectedDate||!reorderMode)return;
    const rows=detail[selectedDate]||[],normalPositions=[];for(let i=0;i<rows.length;i++)if(!rows[i].recurring)normalPositions.push(i);
    const pos=normalPositions.findIndex(i=>Number(rows[i].id)===Number(id));const next=pos+dir;if(pos<0||next<0||next>=normalPositions.length)return;
    const a=normalPositions[pos],b=normalPositions[next];const tmp=rows[a];rows[a]=rows[b];rows[b]=tmp;
    if(modalBody)modalBody.innerHTML=detailHtml(selectedDate);
    const ids=normalPositions.map(i=>Number(rows[i].id)).filter(n=>n>0);
    try{const r=await fetch('/app/api/reorder.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:payload.csrf||'',date:selectedDate,ids})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'並べ替えを保存できませんでした。');}
    catch(e){const tmp=rows[a];rows[a]=rows[b];rows[b]=tmp;if(modalBody)modalBody.innerHTML=detailHtml(selectedDate);alert(e?.message||String(e));}
  }
  modalBody?.addEventListener('click',e=>{const b=e.target.closest('.calendar-move');if(!b)return;e.preventDefault();e.stopPropagation();moveCalendarTask(Number(b.dataset.id),Number(b.dataset.dir));});
  const dayModalSurface=modal?.querySelector('.day-modal');let msx=0,msy=0,modalSwipe=false;
  dayModalSurface?.addEventListener('touchstart',e=>{const t=e.changedTouches&&e.changedTouches[0];if(!t)return;msx=t.clientX;msy=t.clientY;modalSwipe=false;},{passive:true});
  dayModalSurface?.addEventListener('touchmove',e=>{const t=e.changedTouches&&e.changedTouches[0];if(!t||!modalBody)return;const dx=t.clientX-msx,dy=t.clientY-msy;if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){modalSwipe=true;const px=Math.max(-48,Math.min(48,dx*.34));modalBody.style.transition='none';modalBody.style.transform='translateX('+px+'px)';modalBody.style.opacity=String(Math.max(.78,1-Math.abs(px)/180));}},{passive:true});
  dayModalSurface?.addEventListener('touchend',e=>{const t=e.changedTouches&&e.changedTouches[0];if(!t)return;const dx=t.clientX-msx,dy=t.clientY-msy;if(modalBody&&modalSwipe){modalBody.style.transition='transform .14s ease,opacity .14s ease';modalBody.style.transform='translateX(0)';modalBody.style.opacity='1';}if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)){navigateDay(dx<0?1:-1);}modalSwipe=false;},{passive:true});
  dayModalSurface?.addEventListener('touchcancel',()=>{if(modalBody){modalBody.style.transform='translateX(0)';modalBody.style.opacity='1';}modalSwipe=false;});
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
  document.addEventListener('keydown',e=>{if(!modal.classList.contains('open'))return;if(e.key==='Escape')closeModal();if(e.key==='ArrowLeft')navigateDay(-1);if(e.key==='ArrowRight')navigateDay(1);});
  async function toggleItem(el){const checked=el.checked;el.disabled=true;try{const r=await fetch('/api/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'item',id:Number(el.dataset.id),completed:checked,csrf:payload.csrf||''})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'持ち物の更新に失敗しました');}catch(e){el.checked=!checked;alert(e.message);}finally{el.disabled=false;}}
  async function toggleShopping(el){const checked=el.checked;el.disabled=true;try{const r=await fetch('/api/shopping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'toggle',id:Number(el.dataset.id),completed:checked,csrf:payload.csrf||''})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'買い物の更新に失敗しました');}catch(e){el.checked=!checked;alert(e.message);}finally{el.disabled=false;}}
  async function toggleTask(el){const checked=el.checked;el.disabled=true;const recurrence=el.dataset.recurrence==='1',taskId=Number(el.dataset.id),occurrenceId=Number(el.dataset.occurrenceId||0);try{const r=await fetch('/api/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:recurrence?'recurrence':'task',id:taskId,occurrence_id:recurrence?occurrenceId:0,completed:checked,csrf:payload.csrf||''})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'タスクの更新に失敗しました');for(const rows of Object.values(detail)){for(const t of rows){if(Number(t.id)===taskId)t.status=d.status|| (checked?'completed':'pending');}}el.closest('.modal-row')?.classList.toggle('is-completed',String(d.status||'')==='completed');}catch(e){el.checked=!checked;alert(e.message)}finally{el.disabled=false;}}
  document.addEventListener('change',e=>{if(e.target?.classList?.contains('calendar-shop-toggle'))toggleShopping(e.target);if(e.target?.classList?.contains('calendar-item-toggle'))toggleItem(e.target);if(e.target?.classList?.contains('calendar-task-toggle'))toggleTask(e.target);});
  const jumpPanel=document.getElementById('calendarJumpPanel'),monthJump=document.getElementById('calendarMonthJump'),dateJump=document.getElementById('calendarDateJump');
  if(monthLabel)monthLabel.textContent=currentMonth.slice(0,4)+'年'+Number(currentMonth.slice(5))+'月';
  monthLabel?.addEventListener('click',()=>{const opening=Boolean(jumpPanel?.hidden);if(jumpPanel)jumpPanel.hidden=!opening;monthLabel.setAttribute('aria-expanded',opening?'true':'false');});
  monthJump?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(monthJump),year=Number(fd.get('year')),month=Number(fd.get('month'));if(year<2000||year>2100||month<1||month>12)return;location.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+year+'-'+String(month).padStart(2,'0');});
  dateJump?.addEventListener('submit',e=>{e.preventDefault();const value=String(new FormData(dateJump).get('date')||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;loadMonth(value.slice(0,7),value.slice(0,7)<currentMonth?-1:1,value);});
} catch (error) {
  document.documentElement.dataset.calendarJs='error';
  console.error('[calendar] initialization failed', error);
}
})();