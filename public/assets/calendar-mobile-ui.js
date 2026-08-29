(()=>{
'use strict';
try{
  if(location.pathname!=='/app/calendar.php')return;
  document.body.classList.add('calendar-compact-ui');
  const style=document.createElement('style');
  style.dataset.calendarCompactUi='1';
  style.textContent=`
    body.calendar-compact-ui .wrap{max-width:none!important;width:100%!important;padding-left:4px!important;padding-right:4px!important;box-sizing:border-box!important}
    body.calendar-compact-ui .calendar-page-head{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:6px!important;margin:2px 2px 8px!important;padding:0 2px!important}
    body.calendar-compact-ui .calendar-page-head>div:first-child{min-width:0!important}
    body.calendar-compact-ui .calendar-page-head h1{display:none!important}
    body.calendar-compact-ui .calendar-month-label{appearance:none!important;-webkit-appearance:none!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:4px 2px!important;margin:0!important;min-height:40px!important;max-width:100%!important;color:#111827!important;font-size:21px!important;font-weight:850!important;line-height:1.1!important;letter-spacing:-.02em!important;text-align:left!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-month-actions{display:flex!important;align-items:center!important;gap:4px!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-month-actions .btn{width:38px!important;min-width:38px!important;height:38px!important;min-height:38px!important;padding:0!important;border-radius:11px!important;font-size:23px!important;line-height:1!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
    body.calendar-compact-ui .calendar-filter-toggle{width:auto!important;min-width:0!important;padding:0 9px!important;font-size:11px!important;font-weight:800!important;letter-spacing:-.02em!important}
    body.calendar-compact-ui .calendar-view-filter[hidden]{display:none!important}
    body.calendar-compact-ui .calendar-view-filter{display:flex!important;gap:5px!important;overflow-x:auto!important;scrollbar-width:none!important;margin:0 2px 7px!important;padding:6px!important;border:1px solid #e5e7eb!important;border-radius:12px!important;background:#f8fafc!important}
    body.calendar-compact-ui .calendar-view-filter::-webkit-scrollbar{display:none!important}
    body.calendar-compact-ui .calendar-view-filter a{flex:1 0 auto!important;min-width:58px!important;padding:7px 9px!important;border-radius:9px!important;text-align:center!important;font-size:11px!important;font-weight:800!important;text-decoration:none!important;white-space:nowrap!important}
    body.calendar-compact-ui .calendar-jump-panel{position:absolute!important;z-index:95!important;left:2px!important;right:2px!important;top:45px!important;margin:0!important;padding:10px!important;border:1px solid #dbe2ea!important;border-radius:13px!important;background:#fff!important;box-shadow:0 12px 30px rgba(15,23,42,.15)!important}
    body.calendar-compact-ui .calendar-card{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;border-radius:12px!important;overflow:hidden!important;box-shadow:none!important}
    body.calendar-compact-ui .calendar-grid{width:100%!important;max-width:none!important;border-radius:12px!important;box-shadow:none!important}
    body.calendar-compact-ui .calendar-grid .weekday{height:32px!important}
    body.calendar-compact-ui .calendar-grid .weekday span{font-size:11px!important;font-weight:700!important;color:#6b7280!important}
    body.calendar-compact-ui .calendar-grid .calendar-cell{height:82px!important;min-height:82px!important;padding:4px 2px!important}
    body.calendar-compact-ui .calendar-grid .num{height:22px!important;margin:0 0 2px!important;padding-top:1px!important;font-size:13px!important;line-height:20px!important;font-weight:750!important}
    body.calendar-compact-ui .calendar-grid .today-num{width:22px!important;height:22px!important;font-size:13px!important}
    body.calendar-compact-ui .calendar-grid .calendar-items{gap:2px!important;padding:0!important;margin-top:1px!important}
    body.calendar-compact-ui .calendar-grid .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-band{height:17px!important;min-height:17px!important;line-height:17px!important;padding:0 3px!important;font-size:10px!important;font-weight:750!important;letter-spacing:-.02em!important;border-radius:4px!important}
    body.calendar-compact-ui .calendar-grid .calendar-shopping,body.calendar-compact-ui .calendar-grid .meta{font-size:9px!important;line-height:13px!important}
    body.calendar-compact-ui .calendar-fab{right:14px!important;bottom:76px!important}
    @media(max-width:360px){
      body.calendar-compact-ui .calendar-month-label{font-size:19px!important}
      body.calendar-compact-ui .calendar-month-actions .btn{width:35px!important;min-width:35px!important;height:35px!important;min-height:35px!important}
      body.calendar-compact-ui .calendar-filter-toggle{padding:0 7px!important;font-size:10px!important}
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
    toggle.type='button';toggle.id='calendarFilterToggle';toggle.className='btn gray calendar-filter-toggle';toggle.textContent='フィルター⌄';toggle.setAttribute('aria-controls',filter.id);toggle.setAttribute('aria-expanded','false');
    actions.insertBefore(toggle,actions.firstChild);
    toggle.addEventListener('click',()=>{
      const opening=filter.hidden;
      filter.hidden=!opening;
      toggle.setAttribute('aria-expanded',opening?'true':'false');
      toggle.textContent=opening?'フィルター⌃':'フィルター⌄';
    });
  }
  document.documentElement.dataset.calendarMobileUi='ready';
}catch(error){
  document.documentElement.dataset.calendarMobileUi='error';
  console.error('[calendar-mobile-ui] initialization failed',error);
}
})();
