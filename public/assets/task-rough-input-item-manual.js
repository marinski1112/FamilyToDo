(() => {
'use strict';
try{
  const form=document.getElementById('taskForm');
  const genericManual=document.getElementById('taskManualFields');
  if(!form||!genericManual)return;
  const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const itemManual=document.createElement('details');
  itemManual.className='task-manual-fields task-item-manual-fields';
  itemManual.id='itemManualFields';
  itemManual.hidden=true;
  const summary=document.createElement('summary');
  summary.textContent='持ち物を手入力する';
  const body=document.createElement('div');
  body.className='task-manual-body task-item-manual-body';
  const status=document.createElement('p');
  status.className='small';
  status.setAttribute('role','status');
  body.appendChild(status);
  itemManual.append(summary,body);
  form.insertAdjacentElement('afterend',itemManual);

  let loadPromise=null;
  const itemUrl=()=>{
    const url=new URL('/item/new.php',location.origin);
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
    const url=itemUrl();
    body.replaceChildren();
    const message=document.createElement('p');message.className='error';message.textContent='専用の持ち物入力を読み込めませんでした。';
    const link=document.createElement('a');link.className='btn gray';link.href=url.pathname+url.search;link.textContent='持ち物追加ページを開く';
    body.append(message,link);
  };
  const loadItemManual=()=>{
    if(body.dataset.loaded==='1')return Promise.resolve();
    if(loadPromise)return loadPromise;
    status.textContent='持ち物入力を読み込んでいます…';
    const url=itemUrl();
    loadPromise=(async()=>{
      const response=await fetch(url,{headers:{accept:'text/html'}});
      if(!response.ok)throw new Error('item page unavailable');
      const source=await response.text();
      const doc=new DOMParser().parseFromString(source,'text/html');
      const itemForm=doc.getElementById('itemForm');
      const errorBox=doc.getElementById('itemFormError');
      if(!itemForm||!errorBox)throw new Error('item form missing');
      const itemNewSrc=allowedScriptSrc(doc,'/assets/item-new.js');
      if(!itemNewSrc)throw new Error('item controller missing');
      body.replaceChildren(errorBox,itemForm);
      await loadScript(itemNewSrc);
      if(document.documentElement.dataset.itemNewJs!=='ready')throw new Error('item controller failed');
      body.dataset.loaded='1';
    })().catch(()=>{showLoadError();}).finally(()=>{loadPromise=null;});
    return loadPromise;
  };
  const syncManualMode=()=>{
    const itemMode=primary()==='item';
    genericManual.hidden=itemMode;
    itemManual.hidden=!itemMode;
    if(!itemMode)itemManual.open=false;
    if(itemMode&&itemManual.open)void loadItemManual();
  };
  form.querySelectorAll('[name=rough_primary_type]').forEach(input=>input.addEventListener('change',syncManualMode));
  itemManual.addEventListener('toggle',()=>{if(itemManual.open)void loadItemManual();});
  syncManualMode();
  document.documentElement.dataset.taskRoughInputItemManual='ready';
}catch{
  document.documentElement.dataset.taskRoughInputItemManual='error';
}
})();