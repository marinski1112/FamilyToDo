(() => {
'use strict';
try {
  let payload=JSON.parse(document.getElementById('calendarPayload')?.textContent||'{}');
  let detail=payload.detail||{};
  let currentMonth=payload.month||'',currentPrev=payload.prev||'',currentNext=payload.next||'',currentView=payload.view||'all',calendarBusy=false;
  document.documentElement.dataset.calendarJs='ready';
  const compactUiScript=document.createElement('script');compactUiScript.src='/assets/calendar-mobile-ui.js?v=wave128-fix14';compactUiScript.defer=true;document.head.append(compactUiScript);
  const monthLabel=document.getElementById('monthLabel'),prevMonth=document.getElementById('prevMonth'),nextMonth=document.getElementById('nextMonth');
  const calendarFab=document.getElementById('calendarFab');
  if(calendarFab)calendarFab.href='/task/new.php?type=event&date='+(payload.today||'')+'&return=calendar';
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
  function applyStoredCalendarColors(root){
    if(!root?.querySelectorAll)return;
    const safeHex=color=>/^#[0-9a-f]{6}$/i.test(String(color||'').trim())?String(color).trim():'';
    const taskById=new Map();
    for(const rows of Object.values(detail)){
      if(!Array.isArray(rows))continue;
      for(const row of rows){const id=Number(row?.id);if(Number.isFinite(id)&&!taskById.has(id))taskById.set(id,row);}
    }
    root.querySelectorAll('.calendar-band[data-task-id]').forEach(link=>{
      const row=taskById.get(Number(link.dataset.taskId||0)),color=safeHex(row?.calendar_color);if(color)link.style.background=color;
    });
    root.querySelectorAll('.calendar-cell[data-date]').forEach(cell=>{
      const rows=Array.isArray(detail[String(cell.dataset.date||'')])?detail[String(cell.dataset.date||'')]:[];
      const singles=rows.filter(row=>Number(row?.spanDays||1)<=1);
      const elements=[...cell.querySelectorAll('.calendar-items > .calendar-item:not(.item)')];
      elements.forEach((element,index)=>{const color=safeHex(singles[index]?.calendar_color);if(color)element.style.background=color;});
    });
  }
  function applyCalendarDocument(text,targetMonth,dir,openDate){const doc=new DOMParser().parseFromString(text,'text/html');const nextGrid=doc.querySelector('.calendar-grid');const payloadEl=doc.getElementById('calendarPayload');if(!nextGrid||!payloadEl)throw new Error('カレンダー情報を取得できませんでした');const nextPayload=JSON.parse(payloadEl.textContent||'{}');const gridNow=document.querySelector('.calendar-grid');if(!gridNow)throw new Error('カレンダーが見つかりません');gridNow.classList.add('month-changing');gridNow.style.transition='transform .18s cubic-bezier(.2,.8,.2,1),opacity .16s ease';gridNow.style.transform='translateX('+(dir<0?'28px':'-28px')+')';gridNow.style.opacity='0';setTimeout(()=>{gridNow.innerHTML=nextGrid.innerHTML;payload=nextPayload;detail=payload.detail||{};repairRecurringBandLinks(gridNow);applyStoredCalendarColors(gridNow);currentMonth=payload.month||targetMonth;currentPrev=payload.prev||currentPrev;currentNext=payload.next||currentNext;if(monthLabel)monthLabel.textContent=currentMonth.slice(0,4)+'年'+Number(currentMonth.slice(5))+'月';if(prevMonth){prevMonth.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+currentPrev;prevMonth.dataset.month=currentPrev;}if(nextMonth){nextMonth.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+currentNext;nextMonth.dataset.month=currentNext;}gridNow.style.transition='none';gridNow.style.transform='translateX('+(dir<0?'-28px':'28px')+')';void gridNow.offsetWidth;gridNow.style.transition='transform .24s cubic-bezier(.2,.8,.2,1),opacity .20s ease';gridNow.style.opacity='1';gridNow.style.transform='translateX(0)';gridNow.classList.remove('month-changing');history.replaceState(null,'','/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(currentMonth)+(openDate?'&open='+encodeURIComponent(openDate):''));if(openDate)location.assign('/app/tasks.php?date='+encodeURIComponent(openDate));},170);}
  async function loadMonth(targetMonth,dir,openDate=''){if(calendarBusy||!targetMonth||targetMonth===currentMonth){if(openDate)location.assign('/app/tasks.php?date='+encodeURIComponent(openDate));return;}calendarBusy=true;try{const r=await fetch('/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(targetMonth),{headers:{'accept':'text/html'},credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('月表示の取得に失敗しました');applyCalendarDocument(await r.text(),targetMonth,dir,openDate);}catch(e){location.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+encodeURIComponent(targetMonth)+(openDate?'&open='+encodeURIComponent(openDate):'');}finally{setTimeout(()=>{calendarBusy=false},280);}}
  const calendarCard=document.querySelector('.calendar-card');
  repairRecurringBandLinks(document.querySelector('.calendar-grid'));
  applyStoredCalendarColors(document.querySelector('.calendar-grid'));
  let swipeX=0,swipeY=0,swipeActive=false,suppressCalendarClickUntil=0;
  calendarCard?.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(!e.target.closest('.calendar-grid'))return;if(e.pointerType==='mouse'&&e.button!==0)return;swipeX=e.clientX;swipeY=e.clientY;swipeActive=true;});
  calendarCard?.addEventListener('pointerup',e=>{if(e.pointerType==='touch'||!swipeActive)return;swipeActive=false;const dx=e.clientX-swipeX,dy=e.clientY-swipeY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){suppressCalendarClickUntil=Date.now()+350;loadMonth(dx<0?currentNext:currentPrev,dx<0?1:-1);}});
  calendarCard?.addEventListener('pointercancel',()=>{swipeActive=false;});
  let touchX=0,touchY=0,touchTarget=null,touchPreview=false;
  calendarCard?.addEventListener('touchstart',e=>{const t=e.changedTouches&&e.changedTouches[0];const cell=e.target.closest('.calendar-cell');if(!t||!e.target.closest('.calendar-grid'))return;touchX=t.clientX;touchY=t.clientY;touchTarget=cell;touchPreview=false;},{passive:true});
  calendarCard?.addEventListener('touchmove',e=>{const t=e.changedTouches&&e.changedTouches[0],grid=document.querySelector('.calendar-grid');if(!t||!grid||calendarBusy)return;const dx=t.clientX-touchX,dy=t.clientY-touchY;if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){touchPreview=true;const px=Math.max(-42,Math.min(42,dx*.28));grid.style.transition='none';grid.style.transform='translateX('+px+'px)';grid.style.opacity=String(Math.max(.82,1-Math.abs(px)/220));}},{passive:true});
  calendarCard?.addEventListener('touchend',e=>{const t=e.changedTouches&&e.changedTouches[0],grid=document.querySelector('.calendar-grid');if(!t)return;const dx=t.clientX-touchX,dy=t.clientY-touchY,targetCell=e.target.closest('.calendar-cell')||touchTarget;if(grid&&touchPreview){grid.style.transition='transform .14s ease,opacity .14s ease';grid.style.transform='translateX(0)';grid.style.opacity='1';}suppressCalendarClickUntil=Date.now()+420;if(Date.now()<(window.calendarDecorationLongPressUntil||0)){touchTarget=null;touchPreview=false;return;}if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){setTimeout(()=>loadMonth(dx<0?currentNext:currentPrev,dx<0?1:-1),touchPreview?80:0);touchTarget=null;touchPreview=false;return;}if(Math.abs(dx)<28&&Math.abs(dy)<28&&targetCell?.dataset.date)location.assign('/app/tasks.php?date='+encodeURIComponent(targetCell.dataset.date));touchTarget=null;touchPreview=false;},{passive:true});
  calendarCard?.addEventListener('touchcancel',()=>{const grid=document.querySelector('.calendar-grid');if(grid){grid.style.transform='translateX(0)';grid.style.opacity='1';}touchTarget=null;touchPreview=false;});
  calendarCard?.addEventListener('click',e=>{if(Date.now()<suppressCalendarClickUntil||Date.now()<(window.calendarDecorationLongPressUntil||0))return;const cell=e.target.closest('.calendar-cell');if(cell?.dataset.date)location.assign('/app/tasks.php?date='+encodeURIComponent(cell.dataset.date));});
  prevMonth?.addEventListener('click',e=>{e.preventDefault();loadMonth(currentPrev,-1);});
  nextMonth?.addEventListener('click',e=>{e.preventDefault();loadMonth(currentNext,1);});
  const jumpPanel=document.getElementById('calendarJumpPanel'),monthJump=document.getElementById('calendarMonthJump'),dateJump=document.getElementById('calendarDateJump');
  if(monthLabel)monthLabel.textContent=currentMonth.slice(0,4)+'年'+Number(currentMonth.slice(5))+'月';
  monthLabel?.addEventListener('click',()=>{const opening=Boolean(jumpPanel?.hidden);if(jumpPanel)jumpPanel.hidden=!opening;monthLabel.setAttribute('aria-expanded',opening?'true':'false');});
  monthJump?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(monthJump),year=Number(fd.get('year')),month=Number(fd.get('month'));if(year<2000||year>2100||month<1||month>12)return;location.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+year+'-'+String(month).padStart(2,'0');});
  dateJump?.addEventListener('submit',e=>{e.preventDefault();const value=String(new FormData(dateJump).get('date')||'');if(!isDateKey(value)||value<'2000-01-01'||value>'2100-12-31')return;location.href='/app/calendar.php?view='+encodeURIComponent(currentView)+'&month='+value.slice(0,7)+'&open='+value;});
  const initialOpenDate=String(payload.openDate||new URLSearchParams(location.search).get('open')||'');const isDateKey=v=>{if(typeof v!=='string'||!/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};if(initialOpenDate&&isDateKey(initialOpenDate))location.assign('/app/tasks.php?date='+encodeURIComponent(initialOpenDate));

} catch (error) {
  document.documentElement.dataset.calendarJs='error';
  console.error('[calendar] initialization failed', error);
}
})();
