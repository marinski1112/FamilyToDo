(()=>{
'use strict';
try{
  if(!document.getElementById('calendarPayload'))return;
  const style=document.createElement('style');
  style.textContent='.calendar-cell{position:relative}.calendar-stamp-thumb{position:absolute;right:3px;bottom:3px;width:28px;height:28px;object-fit:contain;z-index:8;filter:drop-shadow(0 1px 2px rgba(15,23,42,.18));cursor:pointer}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:28px}.calendar-stamp-viewer{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:20px}.calendar-stamp-viewer.open{display:flex}.calendar-stamp-viewer-card{position:relative;max-width:min(86vw,520px);max-height:78vh;padding:18px;border-radius:24px;background:rgba(255,255,255,.92);box-shadow:0 24px 80px rgba(15,23,42,.22)}.calendar-stamp-viewer-image{display:block;max-width:min(78vw,460px);max-height:68vh;object-fit:contain}.calendar-stamp-viewer-close{position:absolute;right:8px;top:8px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(15,23,42,.68);color:#fff;font-size:23px;line-height:1;cursor:pointer}@media(max-width:600px){.calendar-stamp-thumb{width:23px;height:23px;right:2px;bottom:2px}.calendar-cell.has-calendar-stamp .calendar-items{padding-right:23px}}';
  document.head.appendChild(style);

  const viewer=document.createElement('div');viewer.className='calendar-stamp-viewer';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','アニメーションスタンプ');viewer.innerHTML='<div class="calendar-stamp-viewer-card"><button type="button" class="calendar-stamp-viewer-close" aria-label="閉じる">×</button><img class="calendar-stamp-viewer-image" alt="カレンダースタンプ"></div>';document.body.appendChild(viewer);
  const viewerImage=viewer.querySelector('.calendar-stamp-viewer-image');
  const safeAssetPath=value=>{try{const u=new URL(String(value||''),location.origin);return u.origin===location.origin&&u.pathname.startsWith('/')?u.pathname+u.search:'';}catch{return '';}};
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
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&viewer.classList.contains('open'))closeViewer();});

  let requestSerial=0;
  const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
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
  const grid=document.querySelector('.calendar-grid');if(grid){let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(renderStamps,40);}).observe(grid,{childList:true,subtree:true});}
  renderStamps();
  document.documentElement.dataset.calendarStampUi='ready';
}catch(_error){document.documentElement.dataset.calendarStampUi='error';}
})();
