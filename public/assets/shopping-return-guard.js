(()=>{
'use strict';
if(location.pathname!=='/app/shopping_new.php')return;
const checklist=()=>{const date=new URL(location.href).searchParams.get('date')||'';return date?`/app/tasks.php?date=${encodeURIComponent(date)}#shopping-checklist`:'/app/tasks.php#shopping-checklist';};
const safeReturn=()=>{try{if(!document.referrer)return checklist();const url=new URL(document.referrer);if(url.origin!==location.origin)return checklist();if(url.pathname==='/app/shopping_new.php'||url.pathname==='/app/shopping.php')return checklist();return url.pathname+url.search+url.hash;}catch{return checklist();}};
const returnTarget=safeReturn();
const back=[...document.querySelectorAll('.page-head a[href]')].find(a=>String(a.textContent||'').trim()==='戻る');if(back)back.setAttribute('href',returnTarget);
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{const response=await originalFetch(input,init);try{const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.origin);const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(url.origin===location.origin&&url.pathname==='/api/shopping'&&method==='POST'&&response.ok){history.replaceState(history.state,'',returnTarget);}}catch{}return response;};
})();
