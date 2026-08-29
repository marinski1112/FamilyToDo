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
    body.calendar-compact-ui .calendar-grid .calendar-overflow-hidden{display:none!important}
    body.calendar-compact-ui .calendar-grid .calendar-overflow-indicator{display:block!important;box-sizing:border-box!important;width:100%!important;height:13px!important;min-height:13px!important;line-height:13px!important;margin-top:1px!important;padding:0 2px!important;color:#64748b!important;font-size:8px!important;font-weight:850!important;white-space:nowrap!important;overflow:hidden!important;text-align:left!important;letter-spacing:-.02em!important}
    body.calendar-compact-ui .calendar-grid .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-band{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;height:17px!important;min-height:17px!important;line-height:17px!important;padding:0 3px!important;font-size:10px!important;font-weight:750!important;letter-spacing:-.02em!important;border-radius:4px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important;word-break:normal!important;overflow-wrap:normal!important}
    body.calendar-compact-ui .calendar-grid .calendar-shopping,body.calendar-compact-ui .calendar-grid .meta{font-size:9px!important;line-height:13px!important}
    body.calendar-compact-ui .calendar-fab{right:14px!important;bottom:76px!important}
    .calendar-press-popover{position:fixed!important;z-index:180!important;box-sizing:border-box!important;width:min(280px,calc(100vw - 16px))!important;max-height:min(52vh,360px)!important;overflow:hidden!important;padding:8px!important;border:1px solid rgba(148,163,184,.55)!important;border-radius:12px!important;background:rgba(255,255,255,.98)!important;box-shadow:0 10px 28px rgba(15,23,42,.24)!important;pointer-events:none!important;-webkit-user-select:none!important;user-select:none!important}
    .calendar-press-popover-title{margin:0 2px 6px!important;color:#475569!important;font-size:11px!important;font-weight:800!important;line-height:1.2!important}
    .calendar-press-popover-list{display:grid!important;gap:4px!important;max-height:calc(min(52vh,360px) - 31px)!important;overflow:hidden!important}
    .calendar-press-popover-row{box-sizing:border-box!important;width:100%!important;min-width:0!important;padding:4px 6px!important;border-radius:6px!important;font-size:13px!important;font-weight:750!important;line-height:1.25!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}
    .calendar-press-popover.dense .calendar-press-popover-row{font-size:11px!important;line-height:1.18!important;padding:3px 5px!important}
    @media(max-width:360px){
      body.calendar-compact-ui .calendar-month-label{font-size:19px!important}
      body.calendar-compact-ui .calendar-month-actions .btn{width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important}
      body.calendar-compact-ui .calendar-filter-toggle{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important}
      body.calendar-compact-ui .calendar-view-filter a{font-size:9px!important;min-width:48px!important;padding:5px 6px!important}
      body.calendar-compact-ui .calendar-grid .calendar-cell{height:78px!important;min-height:78px!important}
      body.calendar-compact-ui .calendar-grid .calendar-item,body.calendar-compact-ui .calendar-grid .calendar-band{font-size:9px!important;padding:0 2px!important}
      body.calendar-compact-ui .calendar-grid .calendar-overflow-indicator{font-size:7px!important}
      .calendar-press-popover{width:min(260px,calc(100vw - 12px))!important}
      .calendar-press-popover-row{font-size:12px!important}
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

  const TIMETREE_COLORS=new Set(['#f35f8c','#2ecc87','#47b2f7','#b38bdc','#fdc02d','#fb7f77']);
  const safeHex=color=>/^#[0-9a-f]{6}$/i.test(String(color||'').trim())?String(color).trim().toLowerCase():'';
  const initialPayload=()=>{try{return JSON.parse(document.getElementById('calendarPayload')?.textContent||'{}')}catch{return {}}};
  const colorCache=new Map();
  const applyStoredCalendarColors=(root,detailData)=>{
    if(!root?.querySelectorAll||!detailData)return;
    const byId=new Map();
    for(const rows of Object.values(detailData)){
      if(!Array.isArray(rows))continue;
      for(const row of rows){const id=Number(row?.id);if(Number.isFinite(id)&&!byId.has(id))byId.set(id,row);}
    }
    root.querySelectorAll('.calendar-band[data-task-id]').forEach(el=>{
      const row=byId.get(Number(el.dataset.taskId||0));const color=safeHex(row?.calendar_color);if(color)el.style.background=color;
    });
    root.querySelectorAll('.calendar-cell[data-date]').forEach(cell=>{
      const date=String(cell.dataset.date||''),rows=Array.isArray(detailData[date])?detailData[date]:[];
      const singles=rows.filter(row=>Number(row?.spanDays||1)<=1);
      const els=[...cell.querySelectorAll('.calendar-items > .calendar-item:not(.item)')];
      els.forEach((el,index)=>{const color=safeHex(singles[index]?.calendar_color);if(color)el.style.background=color;});
    });
  };
  const currentMonthKey=()=>new URL(location.href).searchParams.get('month')||String(initialPayload().month||'');
  const refreshStoredColors=async(root=document)=>{
    const first=initialPayload(),month=currentMonthKey();
    if(first.month===month&&first.detail){colorCache.set(month,first.detail);applyStoredCalendarColors(root,first.detail);return;}
    if(colorCache.has(month)){applyStoredCalendarColors(root,colorCache.get(month));return;}
    try{
      const url=new URL(location.href);if(month)url.searchParams.set('month',month);url.searchParams.delete('open');
      const response=await fetch(url.pathname+url.search,{headers:{accept:'text/html'},credentials:'same-origin',cache:'no-store'});if(!response.ok)return;
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      const payloadEl=doc.getElementById('calendarPayload');if(!payloadEl)return;
      const next=JSON.parse(payloadEl.textContent||'{}');if(next.detail){colorCache.set(String(next.month||month),next.detail);applyStoredCalendarColors(root,next.detail);}
    }catch{}
  };
  void TIMETREE_COLORS;

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

  const bandLane=band=>Number(String(band?.style?.gridRow||band?.style?.gridRowStart||'1').split('/')[0].trim())||1;
  const bandsForCell=cell=>{
    const week=cell?.closest?.('.calendar-week');if(!week)return [];
    const cells=[...week.querySelectorAll('.calendar-week-days .calendar-cell')];
    const col=cells.indexOf(cell)+1;if(col<=0)return [];
    return [...week.querySelectorAll('.calendar-week-bands .calendar-band')].filter(band=>{
      const parts=String(band.style.gridColumn||'').split('/').map(x=>Number(x.trim()));
      return parts.length===2&&Number.isFinite(parts[0])&&Number.isFinite(parts[1])&&col>=parts[0]&&col<parts[1];
    }).sort((a,b)=>bandLane(a)-bandLane(b));
  };
  const singlesForCell=cell=>[...cell.querySelectorAll('.calendar-items > .calendar-item:not(.item)')];
  const schedulesForCell=cell=>[...bandsForCell(cell),...singlesForCell(cell)];
  const cellAtPoint=point=>{
    if(!point)return null;
    const x=Number(point.clientX),y=Number(point.clientY);if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    return [...document.querySelectorAll('.calendar-cell')].find(cell=>{const r=cell.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;})||null;
  };
  const setOverflowHidden=(row,hidden)=>{
    row.classList.toggle('calendar-overflow-hidden',hidden);
    if(hidden)row.style.setProperty('display','none','important');
    else row.style.removeProperty('display');
  };

  const updateOverflowIndicators=root=>{
    if(!root?.querySelectorAll)return;
    const scope=root.matches?.('.calendar-grid')?root:(root.querySelector?.('.calendar-grid')||root);
    scope.querySelectorAll?.('.calendar-week-bands .calendar-band').forEach(band=>setOverflowHidden(band,bandLane(band)>2));
    const cells=[];
    if(root.matches?.('.calendar-cell'))cells.push(root);
    root.querySelectorAll('.calendar-cell').forEach(cell=>cells.push(cell));
    cells.forEach(cell=>{
      const bands=bandsForCell(cell);
      const visibleBands=bands.filter(band=>bandLane(band)<=2).length;
      const hiddenBands=Math.max(0,bands.length-visibleBands);
      const singles=singlesForCell(cell);
      const singleSlots=Math.max(0,2-Math.min(2,visibleBands));
      singles.forEach((row,index)=>setOverflowHidden(row,index>=singleSlots));
      const hidden=hiddenBands+Math.max(0,singles.length-singleSlots);
      const host=cell.querySelector('.calendar-items')||cell;
      let indicator=cell.querySelector('.calendar-overflow-indicator');
      if(!hidden){indicator?.remove();return;}
      if(!indicator){indicator=document.createElement('div');indicator.className='calendar-overflow-indicator';host.appendChild(indicator);}
      const label=`… +${hidden}`;
      if(indicator.textContent!==label)indicator.textContent=label;
      indicator.setAttribute('aria-label',`ほか${hidden}件の予定`);
    });
  };
  const refreshGrid=root=>{compactScheduleLabels(root);updateOverflowIndicators(root);void refreshStoredColors(root);};
  refreshGrid(document);
  const grid=document.querySelector('.calendar-grid');
  if(grid){
    let refreshPending=false;
    new MutationObserver(()=>{
      if(refreshPending)return;
      refreshPending=true;
      requestAnimationFrame(()=>{refreshPending=false;refreshGrid(grid);setTimeout(()=>void refreshStoredColors(grid),260);});
    }).observe(grid,{childList:true,subtree:true});
  }

  let preview=null;
  const scheduleTarget=target=>target?.closest?.('.calendar-item,.calendar-band');
  const clearPreview=()=>{preview?.remove();preview=null;};
  const showPreview=(schedule,point)=>{
    const cell=schedule?.closest?.('.calendar-cell')||cellAtPoint(point);
    if(!cell)return;
    const rows=schedulesForCell(cell);
    if(!rows.length)return;
    clearPreview();
    const box=document.createElement('div');box.className='calendar-press-popover'+(rows.length>6?' dense':'');
    const dateText=String(cell.querySelector('.num')?.textContent||'').trim();
    const title=document.createElement('div');title.className='calendar-press-popover-title';title.textContent=dateText?`${dateText}日の予定`:'この日の予定';box.appendChild(title);
    const list=document.createElement('div');list.className='calendar-press-popover-list';
    rows.forEach(source=>{
      const row=document.createElement('div');row.className='calendar-press-popover-row';row.textContent=String(source.textContent||'').replace(/^\s*📌\s*/,'').trim();
      const computed=getComputedStyle(source);row.style.backgroundColor=computed.backgroundColor;row.style.color=computed.color;list.appendChild(row);
    });
    box.appendChild(list);document.body.appendChild(box);preview=box;
    const margin=8,gap=10,viewportW=window.innerWidth,viewportH=window.innerHeight;
    const cellRect=cell.getBoundingClientRect(),rect=box.getBoundingClientRect();
    const desiredX=(point?.clientX??cellRect.left+cellRect.width/2)-rect.width/2;
    const left=Math.max(margin,Math.min(viewportW-rect.width-margin,desiredX));
    let top=Math.min(cellRect.top-gap-rect.height,(point?.clientY??cellRect.top)-gap-rect.height);
    if(top<margin){
      const below=Math.max(cellRect.bottom+gap,(point?.clientY??cellRect.bottom)+gap);
      top=Math.min(viewportH-rect.height-84,below);
    }
    top=Math.max(margin,Math.min(viewportH-rect.height-84,top));
    box.style.left=`${Math.round(left)}px`;box.style.top=`${Math.round(top)}px`;
  };

  document.addEventListener('touchstart',event=>{
    const schedule=scheduleTarget(event.target);if(!schedule)return;
    const touch=event.changedTouches?.[0];
    showPreview(schedule,touch||null);
    event.stopPropagation();
  },{capture:true,passive:true});
  document.addEventListener('touchmove',event=>{if(preview)event.stopPropagation();},{capture:true,passive:true});
  document.addEventListener('touchend',event=>{
    if(!preview&&!scheduleTarget(event.target))return;
    event.preventDefault();event.stopPropagation();clearPreview();
  },{capture:true,passive:false});
  document.addEventListener('touchcancel',()=>clearPreview(),{capture:true,passive:true});
  document.addEventListener('click',event=>{
    if(!scheduleTarget(event.target))return;
    event.preventDefault();event.stopPropagation();
  },{capture:true});
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch')return;
    const schedule=scheduleTarget(event.target);if(!schedule)return;
    showPreview(schedule,event);
  },{capture:true});
  document.addEventListener('pointerup',event=>{if(event.pointerType!=='touch')clearPreview();},{capture:true});
  document.addEventListener('pointercancel',()=>clearPreview(),{capture:true});
  window.addEventListener('blur',clearPreview,{passive:true});

  document.documentElement.dataset.calendarMobileUi='ready';
}catch(error){
  document.documentElement.dataset.calendarMobileUi='error';
  console.error('[calendar-mobile-ui] initialization failed',error);
}
})();