(()=>{
'use strict';
if(location.pathname!=='/app/location.php')return;

// A last known fix and time spent with this page open cannot prove a stay duration.
const memberRowById=id=>id?[...document.querySelectorAll('.location-member-row')].find(row=>String(row.dataset.memberId||'')===id):undefined;
const activityLabel=row=>{
  if(!(row instanceof HTMLElement))return '';
  const state=String(row.dataset.state||'NO_LOCATION');
  if(state==='SHARING_OFF')return '共有OFF';
  if(state==='NO_LOCATION')return '位置情報なし';
  const meta=String(row.querySelector('.location-member-meta')?.textContent||'');
  const staying=meta.includes('自宅内')||meta.includes('に滞在中');
  if(state==='STALE')return staying?'最終確認：滞在':'位置情報待ち';
  if(staying&&(state==='FRESH'||state==='AGING'))return '滞在中';
  return state==='FRESH'||state==='AGING'?'位置更新あり':'位置情報待ち';
};

const polishMarker=marker=>{
  if(!(marker instanceof HTMLElement))return;
  const bubble=marker.querySelector('.location-family-map-marker-bubble');
  if(bubble instanceof HTMLElement&&bubble.style.display!=='none')bubble.style.setProperty('display','none','important');
  const label=marker.querySelector('.location-family-map-marker-label');
  if(!(label instanceof HTMLElement))return;
  const name=String(label.textContent||'').trim();
  if(!name)return;
  const row=memberRowById(String(marker.dataset.memberId||''));
  const status=activityLabel(row);
  let statusNode=marker.querySelector('.location-family-map-marker-status');
  if(!(statusNode instanceof HTMLElement)){
    statusNode=document.createElement('div');
    statusNode.className='location-family-map-marker-status';
    marker.insertBefore(statusNode,label);
  }
  if(statusNode.textContent!==status)statusNode.textContent=status;
  marker.style.gap='2px';
  marker.style.transform='translateY(8px)';
  statusNode.style.padding='2px 7px';
  statusNode.style.borderRadius='999px';
  statusNode.style.background='rgba(30,41,59,.90)';
  statusNode.style.color='#fff';
  statusNode.style.fontSize='10px';
  statusNode.style.fontWeight='750';
  statusNode.style.lineHeight='1.2';
  statusNode.style.whiteSpace='nowrap';
  statusNode.style.boxShadow='0 1px 5px rgba(15,23,42,.18)';
  label.style.fontSize='12px';
  label.style.fontWeight='800';
  label.style.padding='3px 8px';
};

const run=()=>document.querySelectorAll('.location-family-map-marker').forEach(polishMarker);
let queued=false;
const queueRun=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;run();});};
const containsFamilyMarker=node=>node instanceof Element&&(node.matches('.location-family-map-marker')||Boolean(node.querySelector('.location-family-map-marker')));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(records=>{
  if(records.some(record=>[...record.addedNodes].some(containsFamilyMarker)))queueRun();
}).observe(document.body,{childList:true,subtree:true});
setInterval(run,60000);
})();
