(()=>{
'use strict';
const DAILY_PATH='/app/family_log.php';
if(location.pathname!==DAILY_PATH)return;

const normalizedUrl=new URL(location.href);
let needsReload=false;
for(const key of ['type','recorder']){
  if(normalizedUrl.searchParams.has(key)){normalizedUrl.searchParams.delete(key);needsReload=true;}
}
if(needsReload){
  normalizedUrl.searchParams.delete('page');
  location.replace(normalizedUrl.pathname+(normalizedUrl.search?normalizedUrl.search:'')+normalizedUrl.hash);
  return;
}

let payload={};
try{payload=JSON.parse(document.getElementById('familyLogPayload')?.textContent||'{}');}catch{}
const csrf=String(payload.csrf||'');
const quickActions=Array.isArray(payload.quickActions)?payload.quickActions:[];
const quickActionById=new Map(quickActions.map(action=>[Number(action?.id||0),action]));
let runningSubjects=new Map();
let runningLoaded=false;

const breastfeedInfo=button=>{
  if(!(button instanceof HTMLButtonElement)||!button.classList.contains('family-log-quick'))return null;
  const quickId=Number(button.dataset.quickActionId||0),action=quickId?quickActionById.get(quickId):null;
  const type=String(button.dataset.logType||action?.log_type||'').toUpperCase();
  if(type!=='BREASTFEED')return null;
  const subjectId=Number(button.dataset.subjectId||action?.subject_id||payload.selectedSubject||0);
  return subjectId>0?{subjectId}:null;
};

const applyBreastfeedState=()=>{
  if(!runningLoaded)return;
  document.querySelectorAll('button.family-log-quick').forEach(button=>{
    const info=breastfeedInfo(button);if(!info)return;
    const running=runningSubjects.get(info.subjectId);
    const label=button.querySelector('strong');
    if(label instanceof HTMLElement){
      if(!label.dataset.breastfeedIdleLabel)label.dataset.breastfeedIdleLabel=String(label.textContent||'母乳').trim()||'母乳';
      label.textContent=running?'母乳終了':label.dataset.breastfeedIdleLabel;
    }
    button.dataset.breastfeedRunning=running?'1':'0';
    button.setAttribute('aria-pressed',running?'true':'false');
    button.title=running?'母乳タイマーを終了':'母乳タイマーを開始';
  });
};

const loadBreastfeedState=async()=>{
  try{
    const response=await fetch('/api/family-log-breastfeed-timer',{credentials:'same-origin'});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!Array.isArray(data.timers))return;
    runningSubjects=new Map(data.timers.map(timer=>[Number(timer.subject_id||0),timer]).filter(([subjectId])=>subjectId>0));
    runningLoaded=true;
    applyBreastfeedState();
  }catch{/* canonical Family Log remains usable when timer-state loading fails */}
};

document.addEventListener('click',async event=>{
  const target=event.target instanceof Element?event.target.closest('button.family-log-quick'):null;
  const info=breastfeedInfo(target);
  if(!info)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!csrf||target.dataset.breastfeedBusy==='1')return;
  target.dataset.breastfeedBusy='1';target.disabled=true;
  try{
    const response=await fetch('/api/family-log-breastfeed-timer',{
      method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
      body:JSON.stringify({csrf,subject_id:info.subjectId}),
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new Error(String(data?.error||'母乳タイマーを操作できませんでした。'));
    location.reload();
  }catch(error){
    alert(error instanceof Error?error.message:'母乳タイマーを操作できませんでした。');
    target.disabled=false;target.dataset.breastfeedBusy='0';
  }
},true);

const summaryHref=()=>{
  const url=new URL(location.href);
  url.searchParams.delete('type');url.searchParams.delete('recorder');url.searchParams.delete('page');
  url.searchParams.set('dashboard','1');
  url.hash='familyLogSummary';
  return url.pathname+url.search+url.hash;
};

const enhance=()=>{
  const page=document.querySelector('.family-log-page');if(!page)return;
  page.querySelector(':scope > .family-log-timer-card')?.remove();
  page.querySelector(':scope > .family-chore-history')?.remove();
  page.querySelector(':scope > .family-log-timeline > .section-head')?.remove();

  const dashboard=page.querySelector(':scope > .family-log-dashboard');
  if(dashboard instanceof HTMLDetailsElement){
    dashboard.id='familyLogSummary';
    if(new URL(location.href).searchParams.get('dashboard')==='1'){
      dashboard.open=true;
      if(location.hash==='#familyLogSummary')queueMicrotask(()=>dashboard.scrollIntoView({block:'start'}));
    }else dashboard.remove();
  }

  const journalBar=page.querySelector('.family-log-bottom-journal');
  if(journalBar&&!journalBar.querySelector('[data-family-log-summary-link]')){
    const link=document.createElement('a');link.href=summaryHref();link.textContent='📊 まとめ';link.dataset.familyLogSummaryLink='1';
    const foods=[...journalBar.querySelectorAll('a[href]')].find(anchor=>new URL(anchor.href,location.origin).pathname==='/app/child_foods.php');
    if(foods)foods.insertAdjacentElement('afterend',link);else journalBar.appendChild(link);
  }
  applyBreastfeedState();
};

const style=document.createElement('style');
style.textContent='button.family-log-quick[data-breastfeed-running="1"]{box-shadow:inset 0 0 0 2px currentColor}.family-log-bottom-journal a[data-family-log-summary-link]{white-space:nowrap}';
document.head.appendChild(style);
enhance();
loadBreastfeedState();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;enhance();});}).observe(document.body,{childList:true,subtree:true});
})();
