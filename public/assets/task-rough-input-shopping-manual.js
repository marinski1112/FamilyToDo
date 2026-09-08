(() => {
'use strict';
try{
  const form=document.getElementById('taskForm');
  const genericManual=document.getElementById('taskManualFields');
  if(!form||!genericManual)return;
  const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const shoppingManual=document.createElement('details');
  shoppingManual.className='task-manual-fields task-shopping-manual-fields';
  shoppingManual.id='shoppingManualFields';
  shoppingManual.hidden=true;
  const summary=document.createElement('summary');
  summary.textContent='買い物を手入力する';
  const body=document.createElement('div');
  body.className='task-manual-body task-shopping-manual-body';
  const status=document.createElement('p');
  status.className='small';
  status.setAttribute('role','status');
  body.appendChild(status);
  shoppingManual.append(summary,body);
  form.insertAdjacentElement('afterend',shoppingManual);

  let loadPromise=null;
  const shoppingUrl=()=>{
    const url=new URL('/app/shopping_new.php',location.origin);
    const date=String(form.elements.dateOnly?.value||'').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(date))url.searchParams.set('date',date);
    return url;
  };
  const allowedScriptSrc=(doc,path)=>{
    const node=[...doc.querySelectorAll('script[src]')].find(script=>{
      try{const url=new URL(script.getAttribute('src')||'',location.origin);return url.origin===location.origin&&url.pathname===path;}catch{return false;}
    });
    if(!node)return '';
    try{const url=new URL(node.getAttribute('src')||'',location.origin);return url.origin===location.origin&&url.pathname===path?url.href:'';}catch{return '';}
  };
  const loadScript=src=>new Promise((resolve,reject)=>{
    if(!src){resolve();return;}
    const existing=[...document.scripts].find(script=>script.src===src);
    if(existing){resolve();return;}
    const script=document.createElement('script');
    script.src=src;script.async=false;
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('script load failed'));
    document.body.appendChild(script);
  });
  const showLoadError=()=>{
    const url=shoppingUrl();
    body.replaceChildren();
    const message=document.createElement('p');message.className='error';message.textContent='専用の買い物入力を読み込めませんでした。';
    const link=document.createElement('a');link.className='btn gray';link.href=url.pathname+url.search;link.textContent='買い物追加ページを開く';
    body.append(message,link);
  };
  const loadShoppingManual=()=>{
    if(body.dataset.loaded==='1')return Promise.resolve();
    if(loadPromise)return loadPromise;
    status.textContent='買い物入力を読み込んでいます…';
    const url=shoppingUrl();
    loadPromise=(async()=>{
      const response=await fetch(url,{headers:{accept:'text/html'}});
      if(!response.ok)throw new Error('shopping page unavailable');
      const source=await response.text();
      const doc=new DOMParser().parseFromString(source,'text/html');
      const card=doc.getElementById('addShopping');
      const shoppingPayload=doc.getElementById('shoppingNewPayload');
      const taskPayload=doc.getElementById('shoppingTaskLinkPayload');
      if(!card||!shoppingPayload)throw new Error('shopping form missing');
      const taskLinkSrc=allowedScriptSrc(doc,'/assets/shopping-task-link.js');
      const shoppingNewSrc=allowedScriptSrc(doc,'/assets/shopping-new.js');
      if(!shoppingNewSrc||(taskPayload&&!taskLinkSrc))throw new Error('shopping controller missing');
      body.replaceChildren(card,shoppingPayload);
      if(taskPayload)body.appendChild(taskPayload);
      if(taskPayload)await loadScript(taskLinkSrc);
      await loadScript(shoppingNewSrc);
      if(document.documentElement.dataset.shoppingNewJs!=='ready')throw new Error('shopping controller failed');
      body.dataset.loaded='1';
    })().catch(()=>{showLoadError();}).finally(()=>{loadPromise=null;});
    return loadPromise;
  };
  const syncManualMode=()=>{
    const shoppingMode=primary()==='shopping';
    genericManual.hidden=shoppingMode;
    shoppingManual.hidden=!shoppingMode;
    if(!shoppingMode)shoppingManual.open=false;
    if(shoppingMode&&shoppingManual.open)void loadShoppingManual();
  };
  form.querySelectorAll('[name=rough_primary_type]').forEach(input=>input.addEventListener('change',syncManualMode));
  shoppingManual.addEventListener('toggle',()=>{if(shoppingManual.open)void loadShoppingManual();});
  syncManualMode();
  document.documentElement.dataset.taskRoughInputShoppingManual='ready';
}catch{
  document.documentElement.dataset.taskRoughInputShoppingManual='error';
}
})();