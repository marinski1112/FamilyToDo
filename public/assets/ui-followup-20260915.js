(()=>{
'use strict';

const stripLeadingPinFromElement=element=>{
  if(!(element instanceof Element))return;
  for(const node of [...element.childNodes]){
    if(node.nodeType!==Node.TEXT_NODE)continue;
    const text=String(node.textContent||'');
    const cleaned=text.replace(/^\s*📌\s*/u,'');
    if(cleaned!==text)node.textContent=cleaned;
  }
  for(const attr of ['title','aria-label']){
    const value=element.getAttribute(attr);
    if(value&&value.includes('📌'))element.setAttribute(attr,value.replace(/📌\s*/gu,''));
  }
};

const stripEventPins=()=>{
  document.querySelectorAll('.calendar-item,.calendar-band,.event-task-row a[href*="/task/view.php"],#dayModal .modal-task-copy>strong>a').forEach(stripLeadingPinFromElement);
  document.querySelectorAll('h1').forEach(heading=>{
    const text=String(heading.textContent||'');
    if(/^\s*📌\s*イベント詳細/u.test(text))heading.textContent=text.replace(/^\s*📌\s*/u,'');
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
};

const run=()=>{
  fixChecklistFab();
  stripEventPins();
  if(location.pathname==='/app/calendar.php'){
    const modal=document.getElementById('dayModal');
    if(modal instanceof HTMLElement){
      new MutationObserver(stripEventPins).observe(modal,{childList:true,subtree:true,characterData:true});
    }
  }
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
else run();
})();
