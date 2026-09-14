(()=>{
'use strict';
if(location.pathname!=='/app/calendar.php')return;

const nativeFetch=window.fetch.bind(window);
const htmlCache=new Map();
const inFlight=new Map();
const MAX_CACHE=5;

const calendarKey=input=>{
  try{
    const url=new URL(typeof input==='string'?input:input?.url||'',location.origin);
    if(url.origin!==location.origin||url.pathname!=='/app/calendar.php'||!url.searchParams.get('month'))return '';
    return `${url.pathname}?view=${url.searchParams.get('view')||'all'}&month=${url.searchParams.get('month')}`;
  }catch{return '';}
};
const requestUrl=(month,view)=>`/app/calendar.php?view=${encodeURIComponent(view||'all')}&month=${encodeURIComponent(month)}`;
const remember=(key,text)=>{
  if(!key||!text)return;
  htmlCache.delete(key);
  htmlCache.set(key,text);
  while(htmlCache.size>MAX_CACHE)htmlCache.delete(htmlCache.keys().next().value);
};
const cachedResponse=key=>{
  const text=htmlCache.get(key);
  if(!text)return null;
  return new Response(text,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
};

const warm=async(month,view)=>{
  if(!month)return;
  const url=requestUrl(month,view),key=calendarKey(url);
  if(!key||htmlCache.has(key))return;
  if(inFlight.has(key)){await inFlight.get(key);return;}
  const job=nativeFetch(url,{headers:{accept:'text/html'},credentials:'same-origin',cache:'no-store'})
    .then(async response=>{
      if(!response.ok)return;
      const text=await response.text();
      if(text.includes('id="calendarPayload"')&&text.includes('class="calendar-grid"'))remember(key,text);
    })
    .catch(()=>{})
    .finally(()=>inFlight.delete(key));
  inFlight.set(key,job);
  await job;
};

window.fetch=async function(input,init){
  const key=calendarKey(input);
  if(!key)return nativeFetch(input,init);
  const cached=cachedResponse(key);
  if(cached)return cached;
  if(inFlight.has(key)){
    await inFlight.get(key);
    const warmed=cachedResponse(key);
    if(warmed)return warmed;
  }
  const response=await nativeFetch(input,init);
  if(response.ok){
    response.clone().text().then(text=>{
      if(text.includes('id="calendarPayload"')&&text.includes('class="calendar-grid"'))remember(key,text);
    }).catch(()=>{});
  }
  return response;
};

const currentView=()=>new URL(location.href).searchParams.get('view')||'all';
const monthButton=dir=>document.getElementById(dir>0?'nextMonth':'prevMonth');
const warmDirection=dir=>{
  const button=monthButton(dir);
  if(!(button instanceof HTMLAnchorElement))return;
  const month=String(button.dataset.month||'');
  if(month)void warm(month,currentView());
};

let startX=0,startY=0,tracking=false,warmedDir=0;
document.addEventListener('touchstart',event=>{
  const touch=event.changedTouches?.[0];
  if(!touch||!(event.target instanceof Element)||!event.target.closest('.calendar-card .calendar-grid'))return;
  startX=touch.clientX;startY=touch.clientY;tracking=true;warmedDir=0;
},{capture:true,passive:true});

document.addEventListener('touchmove',event=>{
  if(!tracking)return;
  const touch=event.changedTouches?.[0];
  if(!touch)return;
  const dx=touch.clientX-startX,dy=touch.clientY-startY;
  if(Math.abs(dx)<=14||Math.abs(dx)<=Math.abs(dy))return;
  const dir=dx<0?1:-1;
  if(dir===warmedDir)return;
  warmedDir=dir;
  warmDirection(dir);
},{capture:true,passive:true});

document.addEventListener('touchend',event=>{
  if(!tracking)return;
  tracking=false;
  const touch=event.changedTouches?.[0];
  if(!touch)return;
  const dx=touch.clientX-startX,dy=touch.clientY-startY;
  if(Math.abs(dx)<=60||Math.abs(dx)<=Math.abs(dy))return;
  const dir=dx<0?1:-1;
  warmDirection(dir);
  const button=monthButton(dir);
  if(!(button instanceof HTMLAnchorElement))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const grid=document.querySelector('.calendar-grid');
  if(grid instanceof HTMLElement){grid.style.transition='none';grid.style.transform='translateX(0)';grid.style.opacity='1';}
  button.click();
},{capture:true,passive:false});

document.addEventListener('touchcancel',()=>{tracking=false;warmedDir=0;},{capture:true,passive:true});
})();
