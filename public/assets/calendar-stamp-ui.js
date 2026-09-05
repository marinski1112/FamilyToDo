(()=>{
'use strict';
try{
  const calendarPayloadEl=document.getElementById('calendarPayload');
  if(!calendarPayloadEl)return;
  let calendarPayload={};
  try{calendarPayload=JSON.parse(calendarPayloadEl.textContent||'{}');}catch{calendarPayload={};}
  const csrf=String(calendarPayload?.csrf||'');
  const style=document.createElement('style');
  style.textContent='.calendar-cell{position:relative}.calendar-stamp-stack{position:absolute;right:3px;bottom:3px;display:flex;flex-direction:row-reverse;align-items:flex-end;z-index:8;max-width:52px}.calendar-stamp-thumb{position:relative;width:24px;height:24px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 1px 2px rgba(15,23,42,.18));cursor:pointer}.calendar-stamp-thumb+.calendar-stamp-thumb{margin-right:-11px}.calendar-stamp-overflow{position:relative;z-index:9;flex:0 0 auto;min-width:18px;height:18px;margin-right:-8px;border-radius:9px;background:rgba(255,255,255,.94);box-shadow:0 1px 3px rgba(15,23,42,.2);color:#475569;font-size:10px;font-weight:700;line-height:18px;text-align:center}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:32px}.calendar-stamp-viewer{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;background:transparent;padding:20px}.calendar-stamp-picker{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:20px}.calendar-stamp-viewer.open,.calendar-stamp-picker.open{display:flex}.calendar-stamp-viewer-card{position:relative;max-width:min(86vw,520px);max-height:78vh;padding:0;background:transparent;box-shadow:none}.calendar-stamp-picker-card{position:relative;max-width:min(86vw,520px);max-height:78vh;padding:18px;border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 24px 80px rgba(15,23,42,.22)}.calendar-stamp-viewer-image{display:block;margin:auto;max-width:min(78vw,460px);max-height:52vh;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(15,23,42,.16));cursor:pointer}.calendar-stamp-viewer-edit{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;padding:10px;border-radius:14px;background:rgba(255,255,255,.9);box-shadow:0 8px 24px rgba(15,23,42,.1)}.calendar-stamp-viewer-edit label{display:grid;gap:4px;color:#475569;font-size:12px}.calendar-stamp-viewer-edit label:first-child{grid-column:1/-1}.calendar-stamp-viewer-edit input,.calendar-stamp-viewer-edit select{min-height:36px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:4px 8px}.calendar-stamp-viewer-actions{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px}.calendar-stamp-viewer-save{border:1px solid #c4b5fd;border-radius:10px;background:#7c3aed;color:#fff;padding:7px 12px;font-weight:700;cursor:pointer}.calendar-stamp-viewer-delete{border:1px solid #fecaca;border-radius:10px;background:#fff;color:#b91c1c;padding:7px 12px;font-weight:700;cursor:pointer}.calendar-stamp-viewer-save:disabled,.calendar-stamp-viewer-delete:disabled{opacity:.5;cursor:wait}.calendar-stamp-viewer-status{min-height:18px;margin:7px 0 0;color:#64748b;font-size:12px;text-align:center}.calendar-stamp-picker-close{position:absolute;right:8px;top:8px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(15,23,42,.68);color:#fff;font-size:23px;line-height:1;cursor:pointer}.calendar-stamp-picker-card{width:min(92vw,520px);padding:20px}.calendar-stamp-picker-card h3{margin:0 44px 6px 0}.calendar-stamp-picker-date{margin:0 0 12px;color:#64748b;font-size:13px}.calendar-stamp-picker-scope{display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:13px}.calendar-stamp-picker-scope select{min-height:36px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:4px 10px}.calendar-stamp-picker-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-height:min(52vh,430px);overflow:auto;padding:2px}.calendar-stamp-option{position:relative;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:8px;min-width:0;cursor:pointer}.calendar-stamp-option[data-source="shared"]{border-color:#ddd6fe;background:#faf5ff}.calendar-stamp-option:hover,.calendar-stamp-option:focus-visible{border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,.12)}.calendar-stamp-option img,.calendar-stamp-option-placeholder{display:flex;width:100%;aspect-ratio:1;object-fit:contain;align-items:center;justify-content:center;border-radius:9px}.calendar-stamp-option-placeholder{background:#f1f5f9;color:#64748b;font-size:11px}.calendar-stamp-option span{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.calendar-stamp-option-source{position:absolute;right:5px;top:5px;border-radius:999px;background:rgba(124,58,237,.88);color:#fff;padding:2px 5px;font-size:9px;font-weight:700}.calendar-stamp-picker-status{padding:14px 4px;color:#64748b;text-align:center}.calendar-stamp-picker-button{display:none}.day-modal .calendar-stamp-picker-button{display:inline-flex}@media(max-width:600px){.calendar-stamp-stack{right:2px;bottom:2px;max-width:46px}.calendar-stamp-thumb{width:21px;height:21px}.calendar-stamp-thumb+.calendar-stamp-thumb{margin-right:-10px}.calendar-stamp-overflow{min-width:16px;height:16px;margin-right:-7px;font-size:9px;line-height:16px}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:26px}.calendar-stamp-picker-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.calendar-stamp-viewer-edit{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const safeAssetPath=value=>{try{const u=new URL(String(value||''),location.origin);return u.origin===location.origin&&u.pathname.startsWith('/')?u.pathname+u.search:'';}catch{return '';}};
  const safeSharedPublicUrl=(serviceUrl,path)=>{try{const base=new URL(String(serviceUrl||''));if(base.protocol!=='https:')return '';const u=new URL(String(path||''),base);if(u.origin!==base.origin||!u.pathname.startsWith('/v1/stamps/')||u.search||u.hash)return '';return u.toString();}catch{return '';}};

  const viewer=document.createElement('div');viewer.className='calendar-stamp-viewer';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','アニメーションスタンプ');viewer.tabIndex=-1;viewer.innerHTML='<div class="calendar-stamp-viewer-card"><img class="calendar-stamp-viewer-image" alt="カレンダースタンプ"><div class="calendar-stamp-viewer-edit"><label>日付<input type="date" class="calendar-stamp-viewer-date"></label><label>公開範囲<select class="calendar-stamp-viewer-scope"><option value="FAMILY">家族共有</option><option value="PRIVATE">自分専用</option></select></label><label>並び順<input type="number" min="-1000" max="1000" step="1" class="calendar-stamp-viewer-sort"></label></div><div class="calendar-stamp-viewer-actions"><button type="button" class="calendar-stamp-viewer-save">変更を保存</button><button type="button" class="calendar-stamp-viewer-delete">この日から削除</button></div><p class="calendar-stamp-viewer-status" role="status" aria-live="polite"></p></div>';document.body.appendChild(viewer);
  const viewerImage=viewer.querySelector('.calendar-stamp-viewer-image'),viewerSave=viewer.querySelector('.calendar-stamp-viewer-save'),viewerDelete=viewer.querySelector('.calendar-stamp-viewer-delete'),viewerDate=viewer.querySelector('.calendar-stamp-viewer-date'),viewerScope=viewer.querySelector('.calendar-stamp-viewer-scope'),viewerSort=viewer.querySelector('.calendar-stamp-viewer-sort'),viewerStatus=viewer.querySelector('.calendar-stamp-viewer-status');
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  let viewerTimer=0,viewerRun=0,currentViewerStamp=null,deleting=false,updating=false;
  const closeViewer=()=>{if(deleting||updating)return;viewerRun+=1;clearTimeout(viewerTimer);viewerTimer=0;currentViewerStamp=null;viewer.classList.remove('open');if(viewerImage)viewerImage.removeAttribute('src');if(viewerStatus)viewerStatus.textContent='';};
  const normalizedFrames=stamp=>Array.isArray(stamp?.frames)?stamp.frames.map(frame=>({url:safeAssetPath(frame?.url),durationMs:Number(frame?.durationMs)})).filter(frame=>frame.url&&Number.isInteger(frame.durationMs)&&frame.durationMs>=40&&frame.durationMs<=2000):[];
  const setViewerControls=stamp=>{const visibilityScope=String(stamp?.visibilityScope||''),sortOrder=Number(stamp?.sortOrder);if(viewerDate instanceof HTMLInputElement)viewerDate.value=safeDate(stamp?.date)?String(stamp.date):'';if(viewerScope instanceof HTMLSelectElement)viewerScope.value=['FAMILY','PRIVATE'].includes(visibilityScope)?visibilityScope:'FAMILY';if(viewerSort instanceof HTMLInputElement)viewerSort.value=Number.isSafeInteger(sortOrder)?String(sortOrder):'0';};
  const setViewerBusy=busy=>{for(const control of [viewerSave,viewerDelete,viewerDate,viewerScope,viewerSort])if(control instanceof HTMLButtonElement||control instanceof HTMLInputElement||control instanceof HTMLSelectElement)control.disabled=busy;};
  const openViewer=stamp=>{
    if(!viewerImage)return;
    currentViewerStamp=stamp;setViewerControls(stamp);if(viewerStatus)viewerStatus.textContent='';if(viewerSave instanceof HTMLButtonElement)viewerSave.hidden=!csrf;if(viewerDelete instanceof HTMLButtonElement)viewerDelete.hidden=!csrf;
    const frames=normalizedFrames(stamp),run=++viewerRun;clearTimeout(viewerTimer);viewerTimer=0;
    if(frames.length>=2){
      frames.forEach(frame=>{const preload=new Image();preload.src=frame.url;});
      let index=0;
      const play=()=>{if(run!==viewerRun||!viewer.classList.contains('open'))return;const frame=frames[index];viewerImage.src=frame.url;if(reducedMotion())return;index=(index+1)%frames.length;viewerTimer=setTimeout(play,frame.durationMs);};
      viewer.classList.add('open');play();
    }else{
      const fullUrl=safeAssetPath(stamp?.fullUrl);if(!fullUrl)return;viewerImage.src=fullUrl;viewer.classList.add('open');
    }
    viewer.focus({preventScroll:true});
  };
  viewer.addEventListener('click',event=>{const target=event.target;if(target instanceof Element&&target.closest('.calendar-stamp-viewer-edit,.calendar-stamp-viewer-actions'))return;closeViewer();});
  viewerSave?.addEventListener('click',async()=>{
    if(updating||deleting||!csrf)return;
    const placementId=Number(currentViewerStamp?.placementId||0),stampDate=String(viewerDate?.value||''),visibilityScope=String(viewerScope?.value||''),sortOrder=Number(viewerSort?.value);
    if(!Number.isSafeInteger(placementId)||placementId<=0||!safeDate(stampDate)||!['FAMILY','PRIVATE'].includes(visibilityScope)||!Number.isSafeInteger(sortOrder)||sortOrder< -1000||sortOrder>1000){if(viewerStatus)viewerStatus.textContent='日付・公開範囲・並び順を確認してください。';return;}
    updating=true;setViewerBusy(true);if(viewerStatus)viewerStatus.textContent='保存しています…';
    try{
      const response=await fetch('/api/calendar-stamp-placement',{method:'PATCH',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf,placementId,stampDate,visibilityScope,sortOrder})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){if(response.status===404&&viewerStatus)viewerStatus.textContent='この配置は作成者だけ編集できます。';else if(viewerStatus)viewerStatus.textContent='スタンプを更新できませんでした。';return;}
      currentViewerStamp={...currentViewerStamp,date:stampDate,visibilityScope,sortOrder};if(viewerStatus)viewerStatus.textContent='変更を保存しました。';await renderStamps();
    }catch{if(viewerStatus)viewerStatus.textContent='通信に失敗しました。時間をおいて再試行してください。';}
    finally{updating=false;setViewerBusy(false);}
  });
  viewerDelete?.addEventListener('click',async()=>{
    if(deleting||updating||!csrf)return;
    const placementId=Number(currentViewerStamp?.placementId||0);if(!Number.isSafeInteger(placementId)||placementId<=0)return;
    if(!window.confirm('この日のスタンプ配置を削除しますか？'))return;
    deleting=true;setViewerBusy(true);if(viewerStatus)viewerStatus.textContent='削除しています…';
    try{
      const response=await fetch('/api/calendar-stamp-placement',{method:'DELETE',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf,placementId})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){
        if(response.status===404&&viewerStatus)viewerStatus.textContent='この配置は作成者だけ削除できます。';
        else if(viewerStatus)viewerStatus.textContent='スタンプを削除できませんでした。';
        return;
      }
      deleting=false;setViewerBusy(false);closeViewer();await renderStamps();
    }catch{if(viewerStatus)viewerStatus.textContent='通信に失敗しました。時間をおいて再試行してください。';}
    finally{deleting=false;setViewerBusy(false);}
  });

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
  const localOptions=async()=>{
    const response=await fetch('/api/calendar-stamp-options',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!Array.isArray(data.options))throw new Error('STAMP_OPTIONS_FAILED');
    return data.options.map(option=>({source:'local',id:Number(option?.id||0),name:String(option?.name||''),thumbnailUrl:safeAssetPath(option?.thumbnailUrl),fullUrl:safeAssetPath(option?.fullUrl)})).filter(option=>Number.isSafeInteger(option.id)&&option.id>0&&option.thumbnailUrl&&option.fullUrl);
  };
  const sharedOptions=async()=>{
    const response=await fetch('/api/calendar-stamp-admin/shared-catalog',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(response.status===403||response.status===503)return [];
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!Array.isArray(data.stamps))return [];
    const serviceUrl=String(data.serviceUrl||'');
    return data.stamps.map(stamp=>{
      const localAssetId=Number(stamp?.localAssetId||0),localActive=stamp?.localActive;
      if(localActive===false)return null;
      const representation=String(stamp?.representation||''),mimeType=String(stamp?.mimeType||'');
      if(!['image/png','image/webp','image/gif'].includes(mimeType))return null;
      if(representation!=='SINGLE_FILE'&&representation!=='FRAME_SEQUENCE')return null;
      const previewPath=String(stamp?.thumbnailPath||(representation==='SINGLE_FILE'?stamp?.contentPath:'')||'');
      return {
        source:'shared',
        id:Number.isSafeInteger(localAssetId)&&localAssetId>0?localAssetId:0,
        sharedId:String(stamp?.sharedId||''),
        sharedVersion:Number(stamp?.currentVersion||0),
        name:String(stamp?.name||''),
        thumbnailUrl:previewPath?safeSharedPublicUrl(serviceUrl,previewPath):'',
        fullUrl:'',
      };
    }).filter(option=>option&&/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(option.sharedId)&&Number.isSafeInteger(option.sharedVersion)&&option.sharedVersion>0);
  };
  const loadOptions=async()=>{
    if(Array.isArray(optionsCache))return optionsCache;
    const locals=await localOptions();
    let shared=[];
    try{shared=await sharedOptions();}catch{shared=[];}
    const mappedIds=new Set(shared.map(option=>Number(option.id)).filter(id=>Number.isSafeInteger(id)&&id>0));
    optionsCache=[...locals.filter(option=>!mappedIds.has(option.id)),...shared];
    return optionsCache;
  };
  const renderOptions=options=>{
    if(!pickerGrid)return;
    pickerGrid.replaceChildren();
    if(!options.length){const empty=document.createElement('div');empty.className='calendar-stamp-picker-status';empty.textContent='利用できるスタンプがありません。';pickerGrid.appendChild(empty);return;}
    for(const option of options){
      const button=document.createElement('button');button.type='button';button.className='calendar-stamp-option';button.dataset.source=option.source;button.dataset.assetId=String(option.id||0);button.setAttribute('aria-label',option.name?`${option.name}を追加`:'スタンプを追加');
      if(option.source==='shared'){button.dataset.sharedId=option.sharedId;button.dataset.sharedVersion=String(option.sharedVersion);const badge=document.createElement('b');badge.className='calendar-stamp-option-source';badge.textContent='共有';button.appendChild(badge);}
      if(option.thumbnailUrl){const image=document.createElement('img');image.src=option.thumbnailUrl;image.alt='';image.draggable=false;button.appendChild(image);}else{const placeholder=document.createElement('div');placeholder.className='calendar-stamp-option-placeholder';placeholder.textContent='共有スタンプ';button.appendChild(placeholder);}
      const label=document.createElement('span');label.textContent=option.name||'スタンプ';button.appendChild(label);pickerGrid.appendChild(button);
    }
  };
  const openPicker=async()=>{
    const date=selectedModalDate();if(!date||!csrf)return;
    pickerTargetDate=date;if(pickerDate)pickerDate.textContent=date;if(pickerGrid)pickerGrid.innerHTML='<div class="calendar-stamp-picker-status">読み込み中…</div>';picker.classList.add('open');
    try{renderOptions(await loadOptions());}catch{if(pickerGrid)pickerGrid.innerHTML='<div class="calendar-stamp-picker-status">スタンプを読み込めませんでした。</div>';}
    picker.querySelector('.calendar-stamp-picker-close')?.focus();
  };
  const materializeSharedOption=async button=>{
    const existingId=Number(button.dataset.assetId||0);if(Number.isSafeInteger(existingId)&&existingId>0)return existingId;
    const sharedStampId=String(button.dataset.sharedId||''),sharedVersion=Number(button.dataset.sharedVersion||0);
    if(!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(sharedStampId)||!Number.isSafeInteger(sharedVersion)||sharedVersion<=0)throw new Error('SHARED_STAMP_INVALID');
    const response=await fetch('/api/calendar-stamp-admin/shared-catalog',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf,sharedStampId,sharedVersion})});
    const data=await response.json().catch(()=>null);
    const assetId=Number(data?.assetId||0);
    if(!response.ok||!data?.ok||!Number.isSafeInteger(assetId)||assetId<=0)throw new Error(String(data?.error||'SHARED_STAMP_IMPORT_FAILED'));
    button.dataset.assetId=String(assetId);optionsCache=null;return assetId;
  };
  pickerButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openPicker();});
  pickerGrid?.addEventListener('click',async event=>{
    const button=event.target?.closest?.('.calendar-stamp-option');if(!button||placing)return;
    const stampDate=pickerTargetDate,visibilityScope=String(pickerScope?.value||'FAMILY');
    if(!safeDate(stampDate)||!['FAMILY','PRIVATE'].includes(visibilityScope)||!csrf)return;
    placing=true;picker.querySelectorAll('button,select').forEach(control=>{control.disabled=true;});
    try{
      const assetId=button.dataset.source==='shared'?await materializeSharedOption(button):Number(button.dataset.assetId||0);
      if(!Number.isSafeInteger(assetId)||assetId<=0)throw new Error('STAMP_ASSET_INVALID');
      const response=await fetch('/api/calendar-stamp-placement',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf,assetId,stampDate,visibilityScope})});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error('STAMP_PLACE_FAILED');
      picker.classList.remove('open');pickerTargetDate='';await renderStamps();
    }catch{if(pickerGrid){const status=document.createElement('div');status.className='calendar-stamp-picker-status';status.textContent='スタンプを追加できませんでした。';pickerGrid.prepend(status);}}
    finally{placing=false;picker.querySelectorAll('button,select').forEach(control=>{control.disabled=false;});}
  });

  const MAX_VISIBLE_STAMPS_PER_DATE=3;
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
      const stampsByDate=new Map();stampByPlacement.clear();
      for(const stamp of data.stamps){
        const date=String(stamp?.date||''),placementId=Number(stamp?.placementId||0);if(!safeDate(date)||!Number.isSafeInteger(placementId)||placementId<=0)continue;
        stampByPlacement.set(placementId,stamp);const list=stampsByDate.get(date)||[];list.push(stamp);stampsByDate.set(date,list);
      }
      for(const cell of cells){
        cell.querySelectorAll('.calendar-stamp-stack,.calendar-stamp-thumb,.calendar-stamp-overflow').forEach(node=>node.remove());cell.classList.remove('has-calendar-stamp');
        const stamps=stampsByDate.get(String(cell.dataset.date||''))||[];if(!stamps.length)continue;
        const visible=stamps.slice(0,MAX_VISIBLE_STAMPS_PER_DATE),stack=document.createElement('div');stack.className='calendar-stamp-stack';stack.setAttribute('aria-label',`${stamps.length}件のスタンプ`);
        for(const [index,stamp] of visible.entries()){
          const thumbnailUrl=safeAssetPath(stamp.thumbnailUrl),fullUrl=safeAssetPath(stamp.fullUrl),placementId=Number(stamp.placementId||0);if(!thumbnailUrl||!fullUrl||!Number.isSafeInteger(placementId)||placementId<=0)continue;
          const image=document.createElement('img');image.className='calendar-stamp-thumb';image.src=thumbnailUrl;image.alt=`スタンプ ${index+1}/${stamps.length}`;image.dataset.placementId=String(placementId);image.dataset.kind=String(stamp.kind||'STATIC');image.draggable=false;stack.appendChild(image);
        }
        const hiddenCount=stamps.length-visible.length;if(hiddenCount>0){const overflow=document.createElement('span');overflow.className='calendar-stamp-overflow';overflow.textContent=`+${hiddenCount}`;overflow.setAttribute('aria-label',`ほか${hiddenCount}件`);stack.appendChild(overflow);}
        if(!stack.querySelector('.calendar-stamp-thumb'))continue;cell.appendChild(stack);cell.classList.add('has-calendar-stamp');
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