(()=>{
'use strict';

const stripLeadingPinFromElement=element=>{
  if(!(element instanceof Element))return;
  for(const node of [...element.childNodes]){
    if(node.nodeType!==Node.TEXT_NODE)continue;
    const text=String(node.textContent||'');
    const cleaned=text.replace(/📌\s*/gu,'');
    if(cleaned!==text)node.textContent=cleaned;
  }
  for(const attr of ['title','aria-label']){
    const value=element.getAttribute(attr);
    if(value&&value.includes('📌'))element.setAttribute(attr,value.replace(/📌\s*/gu,''));
  }
};

const stripEventPins=()=>{
  document.querySelectorAll('.calendar-item,.calendar-band,.event-task-row a[href*="/task/view.php"]').forEach(stripLeadingPinFromElement);
  document.querySelectorAll('h1').forEach(heading=>{
    const text=String(heading.textContent||'');
    if(/^\s*📌\s*イベント詳細/u.test(text))heading.textContent=text.replace(/^\s*📌\s*/u,'');
  });
};

const stripEventTypeLabels=()=>{
  const roots=document.querySelectorAll('.event-task-row,.task-row,.task-card,.modal-task-copy');
  roots.forEach(root=>{
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const value=String(node.textContent||'');
      const cleaned=value.replace(/\s*[（(]イベント[）)]\s*/gu,' ');
      if(cleaned!==value)node.textContent=cleaned.replace(/\s{2,}/g,' ');
    }
  });
};

const fixChecklistFab=()=>{
  if(location.pathname!=='/app/tasks.php')return;
  const fab=document.querySelector('a.reminders-add-button[href*="/task/new.php"],a.fab.calendar-fab[href*="/task/new.php"]');
  if(!(fab instanceof HTMLAnchorElement))return;
  fab.classList.add('fab','calendar-fab','reminders-add-button');
  fab.innerHTML='<span class="reminders-plus" aria-hidden="true">＋</span>';
  fab.setAttribute('aria-label','詳細を指定して追加');
  fab.title='担当・時間・繰り返しなどを指定して追加';
  const forced={
    position:'fixed',left:'auto',right:'calc(16px + env(safe-area-inset-right, 0px))',bottom:'calc(var(--nav-box-h) + 14px)',
    width:'58px',minWidth:'58px',maxWidth:'58px',height:'58px',minHeight:'58px',padding:'0',margin:'0',borderRadius:'50%',
    display:'flex',alignItems:'center',justifyContent:'center',zIndex:'70',background:'#4f46e5',color:'#fff',textDecoration:'none',
  };
  for(const [name,value] of Object.entries(forced))fab.style.setProperty(name.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`),value,'important');
};

const loadChecklistFollowup=()=>{
  if(location.pathname!=='/app/tasks.php'||document.querySelector('script[data-checklist-followup="1"]'))return;
  const script=document.createElement('script');script.src='/assets/checklist-reminders-followup.js?v=followup2';script.defer=true;script.dataset.checklistFollowup='1';document.head.append(script);
};

const observeCalendarPins=()=>{
  if(location.pathname!=='/app/calendar.php')return;
  const grid=document.querySelector('.calendar-grid');
  if(grid instanceof HTMLElement){
    new MutationObserver(stripEventPins).observe(grid,{childList:true,subtree:true,characterData:true});
  }

};

const run=()=>{
  fixChecklistFab();
  loadChecklistFollowup();
  stripEventPins();
  stripEventTypeLabels();
  observeCalendarPins();
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
else run();
})();
