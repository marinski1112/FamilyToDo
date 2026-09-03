(()=>{
'use strict';
try{
  const calendarPayloadEl=document.getElementById('calendarPayload');
  if(!calendarPayloadEl)return;
  let calendarPayload={};
  try{calendarPayload=JSON.parse(calendarPayloadEl.textContent||'{}');}catch{calendarPayload={};}
  const csrf=String(calendarPayload?.csrf||'');
  const style=document.createElement('style');
  style.textContent='.calendar-cell{position:relative}.calendar-stamp-thumb{position:absolute;right:3px;bottom:3px;width:28px;height:28px;object-fit:contain;z-index:8;filter:drop-shadow(0 1px 2px rgba(15,23,42,.18));cursor:pointer}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:28px}.calendar-stamp-viewer,.calendar-stamp-picker{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:20px}.calendar-stamp-viewer.open,.calendar-stamp-picker.open{display:flex}.calendar-stamp-viewer-card,.calendar-stamp-picker-card{position:relative;max-width:min(86vw,520px);max-height:78vh;padding:18px;border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 24px 80px rgba(15,23,42,.22)}.calendar-stamp-viewer-image{display:block;max-width:min(78vw,460px);max-height:68vh;object-fit:contain}.calendar-stamp-viewer-close,.calendar-stamp-picker-close{position:absolute;right:8px;top:8px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(15,23,42,.68);color:#fff;font-size:23px;line-height:1;cursor:pointer}.calendar-stamp-picker-card{width:min(92vw,520px);padding:20px}.calendar-stamp-picker-card h3{margin:0 44px 6px 0}.calendar-stamp-picker-date{margin:0 0 12px;color:#64748b;font-size:13px}.calendar-stamp-picker-scope{display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:13px}.calendar-stamp-picker-scope select{min-height:36px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:4px 10px}.calendar-stamp-picker-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-height:min(52vh,430px);overflow:auto;padding:2px}.calendar-stamp-option{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:8px;min-width:0;cursor:pointer}.calendar-stamp-option:hover,.calendar-stamp-option:focus-visible{border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,.12)}.calendar-stamp-option img{display:block;width:100%;aspect-ratio:1;object-fit:contain}.calendar-stamp-option span{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.calendar-stamp-picker-status{padding:14px 4px;color:#64748b;text-align:center}.calendar-stamp-picker-button{display:none}.day-modal .calendar-stamp-picker-button{display:inline-flex}@media(max-width:600px){.calendar-stamp-thumb{width:23px;height:23px;right:2px;bottom:2px}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:23px}.calendar-stamp-picker-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}}';
  document.head.appendChild(style);

  const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const safeAssetPath=value=>{try{const u=new URL(String(value||''),location.origin);return u.origin===location.origin&&u.pathname.startsWith('/')?u.pathname+u.search:'';}catch{return '';}};

  const viewer=document.createElement('div');viewer.className='calendar-stamp-viewer';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','アニメーションスタンプ');viewer.innerHTML='<div class="calendar-stamp-viewer-card"><button type="button" class="calendar-stamp-viewer-close" aria-label="閉じる">×</button><img class="calendar-stamp-viewer-image" alt="カレンダースタンプ"></div>';document.body.appendChild(viewer);
  const viewerImage=viewer.querySelector('.calendar-stamp-viewer-image');
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  let viewerTimer=0,viewerRun=0;
  const closeViewer=()=>{viewerRun+=1;clearTimeout(viewerTimer);viewerTimer=0;viewer.classList.remove('open');if(viewerImage)viewerImage.removeAttribute('src');};
  const normalizedFrames=stamp=>Array.isArray(stamp?.frames)?stamp.frames.map(frame=>({url:safeAssetPath(frame?.url),durationMs:Number(frame?.durationMs)})).filter(frame=>frame.url&&Number.isInteger(frame.durationMs)&&frame.durationMs>=40&&frame.durationMs<=2000):[];
  const openViewer=stamp=>{
    if(!viewerImage)return;
    const frames=normalizedFrames(stamp),run=++viewerRun;clearTimeout(viewerTimer);viewerTimer=0;
    if(frames.length>=2){
      frames.forEach(frame=>{const preload=new Image();preload.src=frame.url;});
      let index=0;
      const play=()=>{if(run!==viewerRun||!viewer.classList.contains('open'))return;const frame=frames[index];viewerImage.src=frame.url;if(reducedMotion())return;index=(index+1)%frames.length;viewerTimer=setTimeout(play,frame.durationMs);};
      viewer.classList.add('open');play();
    }else{
      const fullUrl=safeAssetPath(stamp?.fullUrl);if(!fullUrl)return;const url=new URL(fullUrl,location.origin);url.searchParams.set('stamp_play',String(Date.now()));viewerImage.src=url.pathname+url.search;viewer.classList.add('open');
    }
    viewer.querySelector('.calendar-stamp-viewer-close')?.focus();
  };
  viewer.querySelector('.calendar-stamp-viewer-close')?.addEventListener('click',closeViewer);
  viewer.addEventListener('click',event=>{if(event.target===viewer)closeViewer();});

  const picker=document.createElement('div');picker.className='calendar-stamp-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-modal','true');picker.setAttribute('aria-label','スタンプを選択');picker.innerHTML='<div class="calendar-stamp-picker-card"><button type="button" class="calendar-stamp-picker-close" aria-label="閉じる">×</button><h3>スタンプを選択</h3><p class="calendar-stamp-picker-date"></p><label class="calendar-stamp-picker-scope">公開範囲 <select><option value="FAMILY">家族共有</option><option value="PRIVATE">自分専用</option></select></label><div class="calendar-stamp-picker-grid"><div class="calendar-stamp-picker-status">読み込み中…</div></div></div>';document.body.appendChild(picker);
  const pickerGrid=picker.querySelector('.calendar-stamp-picker-grid'),pickerDate=picker.querySelector('.calendar-stamp-picker-date'),pickerScope=picker.querySelector('.calendar-stamp-picker-scope select');
  let pickerTargetDate='',optionsCache=null,placing=false;
  const closePicker=()=>{if(placing)return;picker.classList.remove('open');pickerTargetDate='';};
  picker.querySelector('.calendar-stamp-picker-close')?.addEventListener('click',closePicker);
  picker.addEventListener('click',event=>{if(event.target===picker)closePicker();});
  const dayModal=document.getElementById('dayModal'),modalAdd=document.getElementById('modalAdd'),modalReorder=document.getElementById('modalReorder');
  const pickerButton=document.createElement('button');pickerButton.type='button';pickerButton.className='btn gray small calendar-stamp-picker-button';pickerButton.textContent='スタンプ';pickerButton.setAttribute('aria-label','この日にスタンプを追加');
  if(modalReorder?.parentNode)modalReorder.parentNode.insertBefore(pickerButton,modalReorder);

  const selectedModalDate=()=>{try{const href=String(modalAdd?.getAttribute('href')||'');const u=new URL(href,location.origin),date=String(u.searchParams.get('date')||'');return safeDate(date)?date:'';}catch{return '';}};
  const loadOptions=async()=>{
    if(Array.isArray(optionsCache))return optionsCache;
    const response=await fetch('/api/calendar-stamp-options',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!Array.isArray(data.options))throw new Error('STAMP_OPTIONS_FAILED');
    optionsCache=data.options.map(option=>({id:Number(option?.id||0),name:String(option?.name||''),thumbnailUrl:safeAssetPath(option?.thumbnailUrl),fullUrl:safeAssetPath(option?.fullUrl)})).filter(option=>Number.isSafeInteger(option.id)&&option.id>0&&option.thumbnailUrl&&option.fullUrl);
    return optionsCache;
  };
  const renderOptions=options=>{
    if(!pickerGrid)return;
    pickerGrid.replaceChildren();
    if(!options.length){const empty=document.createElement('div');empty.className='calendar-stamp-picker-status';empty.textContent='利用できるスタンプがありません。';pickerGrid.appendChild(empty);return;}
    for(const option of options){
      const button=document.createElement('button');button.type='button';button.className='calendar-stamp-option';button.dataset.assetId=String(option.id);button.setAttribute('aria-label',option.name?`${option.name}を追加`:'スタンプを追加');
      const image=document.createElement('img');image.src=option.thumbnailUrl;image.alt='';image.draggable=false;const label=document.createElement('span');label.textContent=option.name||'スタンプ';button.append(image,label);pickerGrid.appendChild(button);
    }
  };
  const openPicker=async()=>{
    const date=selectedModalDate();if(!date||!csrf)return;
    pickerTargetDate=date;if(pickerDate)pickerDate.textContent=date;if(pickerGrid)pickerGrid.innerHTML='<div class="calendar-stamp-picker-status">読み込み中…</div>';picker.classList.add('open');
    try{renderOptions(await loadOptions());}catch{if(pickerGrid)pickerGrid.innerHTML='<div class="calendar-stamp-picker-status">スタンプを読み込めませんでした。</div>';}
    picker.querySelector('.calendar-stamp-picker-close')?.focus();
  };
  pickerButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openPicker();});
  pickerGrid?.addEventListener('click',async event=>{
    const button=event.target?.closest?.('.calendar-stamp-option');if(!button||placing)return;
    const assetId=Number(button.dataset.assetId||0),stampDate=pickerTargetDate,visibilityScope=String(pickerScope?.value||'FAMILY');
    if(!Number.isSafeInteger(assetId)||assetId<=0||!safeDate(stampDate)||!['FAMILY','PRIVATE'].includes(visibilityScope)||!csrf)return;
    placing=true;picker.querySelectorAll('button,select').forEach(control=>{control.disabled=true;});
    try{
      const response=await fetch('/api/calendar-stamp-placement',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf,assetId,stampDate,visibilityScope})});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error('STAMP_PLACE_FAILED');
      picker.classList.remove('open');pickerTargetDate='';await renderStamps();
    }catch{if(pickerGrid){const status=document.createElement('div');status.className='calendar-stamp-picker-status';status.textContent='スタンプを追加できませんでした。';pickerGrid.prepend(status);}}
    finally{placing=false;picker.querySelectorAll('button,select').forEach(control=>{control.disabled=false;});}
  });

  let requestSerial=0;
  const stampByPlacement=new Map();
  async function renderStamps(){
    const grid=document.querySelector('.calendar-grid');if(!grid)return;
    const cells=[...grid.querySelectorAll('.calendar-cell[data-date]')];
    const dates=cells.map(cell=>String(cell.dataset.date||'')).filter(safeDate).sort();if(!dates.length)return;
    const serial=++requestSerial;
    try{
      const response=await fetch('/api/calendar-stamps?from='+encodeURIComponent(dates[0])+'&to='+encodeURIComponent(dates[dates.length-1]),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const data=await response.json().catch(()=>null);if(serial!==requestSerial||!response.ok||!data?.ok||!Array.isArray(data.stamps))return;
      const firstByDate=new Map();stampByPlacement.clear();for(const stamp of data.stamps){const date=String(stamp?.date||''),placementId=Number(stamp?.placementId||0);if(safeDate(date)&&Number.isSafeInteger(placementId)&&placementId>0){stampByPlacement.set(placementId,stamp);if(!firstByDate.has(date))firstByDate.set(date,stamp);}}
      for(const cell of cells){
        cell.querySelectorAll('.calendar-stamp-thumb').forEach(node=>node.remove());cell.classList.remove('has-calendar-stamp');
        const stamp=firstByDate.get(String(cell.dataset.date||''));if(!stamp)continue;
        const thumbnailUrl=safeAssetPath(stamp.thumbnailUrl),fullUrl=safeAssetPath(stamp.fullUrl),placementId=Number(stamp.placementId||0);if(!thumbnailUrl||!fullUrl||!Number.isSafeInteger(placementId)||placementId<=0)continue;
        const image=document.createElement('img');image.className='calendar-stamp-thumb';image.src=thumbnailUrl;image.alt='スタンプ';image.dataset.placementId=String(placementId);image.dataset.kind=String(stamp.kind||'STATIC');image.draggable=false;cell.appendChild(image);cell.classList.add('has-calendar-stamp');
      }
    }catch{/* stamp rendering fails closed without breaking Calendar */}
  }
  const stampFromTarget=target=>{const image=target?.closest?.('.calendar-stamp-thumb');if(!image)return null;const placementId=Number(image.dataset.placementId||0);return Number.isSafeInteger(placementId)&&placementId>0?stampByPlacement.get(placementId)||null:null;};
  document.addEventListener('click',event=>{const stamp=stampFromTarget(event.target);if(!stamp)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openViewer(stamp);},true);
  document.addEventListener('touchend',event=>{const stamp=stampFromTarget(event.target);if(!stamp)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openViewer(stamp);},true);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(picker.classList.contains('open'))closePicker();else if(viewer.classList.contains('open'))closeViewer();});
  const grid=document.querySelector('.calendar-grid');if(grid){let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(renderStamps,40);}).observe(grid,{childList:true,subtree:true});}
  if(dayModal&&!csrf)pickerButton.hidden=true;
  renderStamps();
  document.documentElement.dataset.calendarStampUi='ready';
}catch(_error){document.documentElement.dataset.calendarStampUi='error';}
})();
