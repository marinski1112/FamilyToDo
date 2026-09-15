(()=>{
'use strict';
if(location.pathname!=='/app/location.php')return;

const STORAGE_PREFIX='familytodo:location-marker-stay:';

const memberRowByName=name=>[...document.querySelectorAll('.location-member-row')].find(row=>{
  const node=row.querySelector('.location-member-name');
  return String(node?.textContent||'').trim()===name;
});

const markerContext=row=>{
  const meta=String(row?.querySelector('.location-member-meta')?.textContent||'');
  if(meta.includes('自宅内')||meta.includes('最終確認：🏠 自宅内'))return 'HOME';
  const registered=meta.match(/登録地点\s+([^・]+?)(?:に滞在中)?(?:\s*・|$)/u);
  if(registered?.[1])return `PLACE:${registered[1].trim()}`;
  const stay=meta.match(/([^・]+)に滞在中/u);
  if(stay?.[1])return `PLACE:${stay[1].trim()}`;
  return '';
};

const isStaying=row=>{
  if(!(row instanceof HTMLElement))return false;
  const meta=String(row.querySelector('.location-member-meta')?.textContent||'');
  return meta.includes('自宅内')||meta.includes('最終確認：🏠 自宅内')||meta.includes('に滞在中');
};

const stagedStayLabel=minutes=>{
  if(minutes>=3*24*60)return '3日以上滞在中';
  if(minutes>=24*60)return '1日以上滞在中';
  if(minutes>=6*60)return '6時間以上滞在中';
  if(minutes>=3*60)return '3時間以上滞在中';
  if(minutes>=60)return '1時間以上滞在中';
  if(minutes>=30)return '30分以上滞在中';
  if(minutes>=10)return '10分以上滞在中';
  return '滞在中';
};

const stayLabel=(row,context)=>{
  const memberId=String(row?.dataset.memberId||'').trim();
  if(!memberId||!context)return '滞在中';
  const key=`${STORAGE_PREFIX}${memberId}`;
  const now=Date.now();
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
  if(!saved||saved.context!==context||!Number.isFinite(Number(saved.since))||Number(saved.since)>now){
    saved={context,since:now};
    try{localStorage.setItem(key,JSON.stringify(saved))}catch{}
  }
  const minutes=Math.floor((now-Number(saved.since))/60000);
  return stagedStayLabel(minutes);
};

const activityLabel=row=>{
  if(!(row instanceof HTMLElement))return '';
  const state=String(row.dataset.state||'NO_LOCATION');
  const context=markerContext(row);
  if(isStaying(row))return stayLabel(row,context||'STAY');
  const memberId=String(row.dataset.memberId||'').trim();
  if(memberId){try{localStorage.removeItem(`${STORAGE_PREFIX}${memberId}`)}catch{}}
  if(state==='FRESH'||state==='AGING')return '移動中';
  if(state==='STALE')return '位置情報待ち';
  if(state==='SHARING_OFF')return '共有OFF';
  return '位置情報なし';
};

const polishMarker=marker=>{
  if(!(marker instanceof HTMLElement))return;
  const bubble=marker.querySelector('.location-family-map-marker-bubble');
  if(bubble instanceof HTMLElement&&bubble.style.display!=='none')bubble.style.setProperty('display','none','important');
  const label=marker.querySelector('.location-family-map-marker-label');
  if(!(label instanceof HTMLElement))return;
  const name=String(label.textContent||'').trim();
  if(!name)return;
  const row=memberRowByName(name);
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
