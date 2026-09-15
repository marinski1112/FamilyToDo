(()=>{
'use strict';
if(location.pathname!=='/app/location.php')return;

const STORAGE_PREFIX='familytodo:location-marker-stay:';
const STAY_BUCKETS=[
  [3*24*60,'3日以上滞在中'],
  [24*60,'1日以上滞在中'],
  [6*60,'6時間以上滞在中'],
  [3*60,'3時間以上滞在中'],
  [60,'1時間以上滞在中'],
  [30,'30分以上滞在中'],
  [10,'10分以上滞在中'],
];

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

const bucketLabel=minutes=>{
  if(!Number.isFinite(minutes)||minutes<10)return '滞在中';
  for(const [threshold,label] of STAY_BUCKETS){if(minutes>=threshold)return label;}
  return '滞在中';
};

const signalAgeMinutes=row=>{
  const direct=Number(row?.dataset.ageMinutes);
  if(Number.isFinite(direct)&&direct>=0)return Math.floor(direct);
  const meta=String(row?.querySelector('.location-member-meta')?.textContent||'');
  const hours=meta.match(/(\d+)時間以上前/u);
  if(hours)return Number(hours[1])*60;
  const minutes=meta.match(/(\d+)分前/u);
  if(minutes)return Number(minutes[1]);
  if(meta.includes('たった今'))return 0;
  return null;
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
  let minutes=Math.floor((now-Number(saved.since))/60000);
  // HOME is intentionally sticky when the signal goes stale. The age of the
  // last HOME fix is therefore a safe lower bound for the displayed stay bucket.
  if(context==='HOME'&&String(row.dataset.state||'')==='STALE'){
    const ageMinutes=signalAgeMinutes(row);
    if(Number.isFinite(ageMinutes)&&ageMinutes>=0)minutes=Math.max(minutes,ageMinutes);
  }
  return bucketLabel(minutes);
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
