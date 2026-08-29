(()=>{
'use strict';
try{
  if(location.pathname!=='/app/calendar.php')return;
  document.body.classList.add('calendar-compact-ui');
  const style=document.createElement('style');
  style.dataset.calendarCompactUi='1';
  style.textContent=`
    body.calendar-compact-ui .wrap{max-width:none!important;width:100%!important;padding-left:4px!important;padding-right:4px!important;box-sizing:border-box!important}
    body.calendar-compact-ui .calendar-page-head{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:5px!important;margin:2px 2px 8px!important;padding:0 2px!important}
    body.calendar-compact-ui .calendar-page-head>div:first-child{min-width:0!important}
    body.calendar-compact-ui .calendar-page-head h1{display:none!important}
    body.calendar-compact-ui .calendar-month-label{appearance:none!important;-webkit-appearance:none!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:4px 2px!important;margin:0!important;min-height:38px!important;max-width:100%!important;color:#111827!important;font-size:21px!important;font-weight:850!important;line-height:1.1!important;letter-spacing:-.02em!important;text-align:left!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-month-actions{display:flex!important;align-items:center!important;gap:3px!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-month-actions .btn{width:36px!important;min-width:36px!important;height:36px!important;min-height:36px!important;padding:0!important;border-radius:10px!important;font-size:22px!important;line-height:1!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
    body.calendar-compact-ui .calendar-filter-toggle{width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important;padding:0!important;font-size:0!important}
    body.calendar-compact-ui .calendar-filter-toggle svg{width:17px!important;height:17px!important;display:block!important;pointer-events:none!important}
    body.calendar-compact-ui .calendar-view-filter[hidden]{display:none!important}
    body.calendar-compact-ui .calendar-view-filter{display:flex!important;gap:5px!important;overflow-x:auto!important;scrollbar-width:none!important;margin:0 2px 7px!important;padding:5px!important;border:1px solid #e5e7eb!important;border-radius:11px!important;background:#f8fafc!important}
    body.calendar-compact-ui .calendar-view-filter::-webkit-scrollbar{display:none!important}
    body.calendar-compact-ui .calendar-view-filter a{flex:1 0 auto!important;min-width:52px!important;padding:6px 8px!important;border-radius:8px!important;text-align:center!important;font-size:10px!important;font-weight:800!important;text-decoration:none!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-jump-panel{position:absolute!important;z-index:95!important;left:2px!important;right:2px!important;top:43px!important;margin:0!important;padding:10px!important;border:1px solid #dbe2ea!important;border-radius:13px!important;background:#fff!important;box-shadow:0 12px 30px rgba(15,23,42,.15)!important}
    body.calendar-compact-ui .calendar-card{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;border-radius:12px!important;overflow:hidden!important;box-shadow:none!important}
    body.calendar-compact-ui .calendar-grid{width:100%!important;max-width:none!important;border-radius:12px!important;box-shadow:none!important}
    body.calendar-compact-ui .calendar-grid .weekday{height:31px!important}
    body.calendar-compact-ui .calendar-grid .weekday span{font-size:10px!important;font-weight:700!important;color:#6b7280!important}
    body.calendar-compact-ui .calendar-grid .calendar-cell{height:82px!important;min-height:82px!important;padding:4px 2px!important;overflow:hidden!important}
    body.calendar-compact-ui .calendar-grid .num{height:22px!important;margin:0 0 2px!important;padding-top:1px!important;font-size:13px!important;line-height:20px!important;font-weight:750!important}
    body.calendar-compact-ui .calendar-grid .today-num{width:22px!important;height:22px!important;font-size:13px!important}
    body.calendar-compact-ui .calendar-grid .calendar-items{gap:2px!important;padding:0!important;margin-top:1px!important;max-width:100%!important;overflow:hidden!important}
    body.calendar-compact-ui .calendar-grid .calendar-items>*:nth-child(n+3){display:none!important}
    body.calendar-compact-ui .calendar-grid .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-band{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;height:17px!important;min-height:17px!important;line-height:17px!important;padding:0 3px!important;font-size:10px!important;font-weight:750!important;letter-spacing:-.02em!important;border-radius:4px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important;word-break:normal!important;overflow-wrap:normal!important}
    body.calendar-compact-ui .calendar-grid .calendar-cell.calendar-press-preview .calendar-items>*{display:block!important}
    body.calendar-compact-ui .calendar-grid .calendar-cell.calendar-press-preview .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-cell.calendar-press-preview .calendar-band{height:auto!important;min-height:17px!important;line-height:14px!important;padding-top:2px!important;padding-bottom:2px!important;white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:break-word!important}
    body.calendar-compact-ui .calendar-grid .calendar-shopping,body.calendar-compact-ui .calendar-grid .meta{font-size:9px!important;line-height:13px!important}
    body.calendar-compact-ui .calendar-fab{right:14px!important;bottom:76px!important}
    @media(max-width:360px){
      body.calendar-compact-ui .calendar-month-label{font-size:19px!important}
      body.calendar-compact-ui .calendar-month-actions .btn{width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important}
      body.calendar-compact-ui .calendar-filter-toggle{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important}
      body.calendar-compact-ui .calendar-view-filter a{font-size:9px!important;min-width:48px!important;padding:5px 6px!important}
      body.calendar-compact-ui .calendar-grid .calendar-cell{height:78px!important;min-height:78px!important}
      body.calendar-compact-ui .calendar-grid .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-band{font-size:9px!important;padding:0 2px!important}
    }
  `;
  document.head.append(style);

  const pageHead=document.querySelector('.calendar-page-head');
  const actions=pageHead?.querySelector('.calendar-month-actions');
  const filter=document.querySelector('.calendar-view-filter');
  const monthLabel=document.getElementById('monthLabel');
  if(monthLabel)monthLabel.textContent=monthLabel.textContent.replace(/\s*▼\s*$/,'').trim();
  if(actions&&filter&&!document.getElementById('calendarFilterToggle')){
    filter.hidden=true;
    filter.id=filter.id||'calendarViewFilter';
    const toggle=document.createElement('button');
    toggle.type='button';toggle.id='calendarFilterToggle';toggle.className='btn gray calendar-filter-toggle';toggle.setAttribute('aria-label','表示フィルター');toggle.setAttribute('title','表示フィルター');toggle.setAttribute('aria-controls',filter.id);toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.4 7.1v5.2l-3.2 1.7v-6.9L4 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    actions.insertBefore(toggle,actions.firstChild);
    toggle.addEventListener('click',()=>{
      const opening=filter.hidden;
      filter.hidden=!opening;
      toggle.setAttribute('aria-expanded',opening?'true':'false');
    });
  }

  const compactScheduleLabels=root=>{
    if(!root?.querySelectorAll)return;
    root.querySelectorAll('.calendar-item,.calendar-band').forEach(el=>{
      const text=String(el.textContent||'').replace(/^\s*📌\s*/,'');
      if(el.textContent!==text)el.textContent=text;
      if(el.tagName==='A'&&matchMedia('(max-width:600px)').matches&&el.hasAttribute('href')){
        el.dataset.calendarPreviewHref=el.getAttribute('href')||'';
        el.removeAttribute('href');
        el.setAttribute('role','button');
        el.setAttribute('aria-label',text);
      }
    });
  };
  compactScheduleLabels(document);
  const grid=document.querySelector('.calendar-grid');
  if(grid)new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(node=>{if(node.nodeType===1)compactScheduleLabels(node);}))).observe(grid,{childList:true,subtree:true});

  let pressedCell=null;
  const scheduleTarget=target=>target?.closest?.('.calendar-item,.calendar-band');
  const clearPress=()=>{pressedCell?.classList.remove('calendar-press-preview');pressedCell=null;};
  document.addEventListener('touchstart',event=>{
    const schedule=scheduleTarget(event.target);if(!schedule)return;
    const cell=schedule.closest('.calendar-cell');if(!cell)return;
    clearPress();pressedCell=cell;cell.classList.add('calendar-press-preview');
    event.stopPropagation();
  },{capture:true,passive:true});
  document.addEventListener('touchend',event=>{
    if(!scheduleTarget(event.target)&&!pressedCell)return;
    event.preventDefault();event.stopPropagation();
    clearPress();
  },{capture:true,passive:false});
  document.addEventListener('touchcancel',()=>clearPress(),{capture:true,passive:true});
  document.addEventListener('click',event=>{
    if(!scheduleTarget(event.target))return;
    event.preventDefault();event.stopPropagation();
  },{capture:true});
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch')return;
    const schedule=scheduleTarget(event.target);if(!schedule)return;
    const cell=schedule.closest('.calendar-cell');if(!cell)return;
    clearPress();pressedCell=cell;cell.classList.add('calendar-press-preview');
  },{capture:true});
  document.addEventListener('pointerup',event=>{if(event.pointerType!=='touch')clearPress();},{capture:true});
  document.addEventListener('pointercancel',()=>clearPress(),{capture:true});

  document.documentElement.dataset.calendarMobileUi='ready';
}catch(error){
  document.documentElement.dataset.calendarMobileUi='error';
  console.error('[calendar-mobile-ui] initialization failed',error);
}
})();
