(()=>{
'use strict';
if(location.pathname!=='/app/calendar.php')return;

const nativeFetch=window.fetch.bind(window);
const htmlCache=new Map();
const inFlight=new Map();

const parsePayload=()=>{
  try{return JSON.parse(document.getElementById('calendarPayload')?.textContent||'{}');}catch{return {};}
};
const calendarKey=input=>{
  try{
    const url=new URL(typeof input==='string'?input:input?.url||'',location.origin);
    if(url.origin!==location.origin||url.pathname!=='/app/calendar.php'||!url.searchParams.get('month'))return '';
    return `${url.pathname}?view=${url.searchParams.get('view')||'all'}&month=${url.searchParams.get('month')}`;
  }catch{return '';}
};
const requestUrl=(month,view)=>`/app/calendar.php?view=${encodeURIComponent(view||'all')}&month=${encodeURIComponent(month)}`;

const warm=async(month,view)=>{
  if(!month)return;
  const url=requestUrl(month,view),key=calendarKey(url);
  if(!key||htmlCache.has(key)||inFlight.has(key))return;
  const job=nativeFetch(url,{headers:{accept:'text/html'},credentials:'same-origin',cache:'no-store'})
    .then(async response=>{
      if(!response.ok)return;
      const text=await response.text();
      if(text.includes('id="calendarPayload"')&&text.includes('class="calendar-grid"'))htmlCache.set(key,text);
    })
    .catch(()=>{})
    .finally(()=>inFlight.delete(key));
  inFlight.set(key,job);
  await job;
};

window.fetch=async function(input,init){
  const key=calendarKey(input);
  if(!key)return nativeFetch(input,init);
  if(htmlCache.has(key)){
    const text=htmlCache.get(key);
    htmlCache.delete(key);
    queueMicrotask(()=>{
      try{
        const doc=new DOMParser().parseFromString(text,'text/html');
        const next=JSON.parse(doc.getElementById('calendarPayload')?.textContent||'{}');
        warm(next.prev,next.view||'all');
        warm(next.next,next.view||'all');
      }catch{}
    });
    return new Response(text,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  }
  const response=await nativeFetch(input,init);
  if(response.ok){
    response.clone().text().then(text=>{if(text.includes('id="calendarPayload"'))htmlCache.set(key,text)}).catch(()=>{});
  }
  return response;
};

const initial=parsePayload();
warm(initial.prev,initial.view||'all');
warm(initial.next,initial.view||'all');

let startX=0,startY=0,tracking=false;
document.addEventListener('touchstart',event=>{
  const touch=event.changedTouches?.[0];
  if(!touch||!(event.target instanceof Element)||!event.target.closest('.calendar-card .calendar-grid'))return;
  startX=touch.clientX;startY=touch.clientY;tracking=true;
  const payload=parsePayload();
  warm(payload.prev,payload.view||'all');
  warm(payload.next,payload.view||'all');
},{capture:true,passive:true});

document.addEventListener('touchend',event=>{
  if(!tracking)return;
  tracking=false;
  const touch=event.changedTouches?.[0];
  if(!touch)return;
  const dx=touch.clientX-startX,dy=touch.clientY-startY;
  if(Math.abs(dx)<=60||Math.abs(dx)<=Math.abs(dy))return;
  const button=document.getElementById(dx<0?'nextMonth':'prevMonth');
  if(!(button instanceof HTMLAnchorElement))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const grid=document.querySelector('.calendar-grid');
  if(grid instanceof HTMLElement){grid.style.transition='none';grid.style.transform='translateX(0)';grid.style.opacity='1';}
  button.click();
},{capture:true,passive:false});

const monthLabel=document.getElementById('monthLabel');
if(monthLabel instanceof HTMLElement){
  new MutationObserver(()=>{
    const prev=document.getElementById('prevMonth');
    const next=document.getElementById('nextMonth');
    const view=new URL(location.href).searchParams.get('view')||initial.view||'all';
    warm(prev?.dataset.month,view);
    warm(next?.dataset.month,view);
  }).observe(monthLabel,{childList:true,characterData:true,subtree:true});
}
})();
