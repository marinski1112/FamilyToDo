(()=>{
  const card=document.getElementById('mediaCleanupRecovery'),list=document.getElementById('mediaCleanupDead');
  if(!card||!list)return;
  const csrf=String(JSON.parse(document.getElementById('settingsPayload')?.textContent||'{}').csrf||'');
  fetch('/api/family-log-media-cleanup-admin',{credentials:'same-origin',cache:'no-store'})
    .then(response=>response.json()).then(data=>{
      if(!data?.ok||!Array.isArray(data.dead)||!data.dead.length)return;
      card.hidden=false;
      for(const row of data.dead){
        const id=Number(row.id);if(!Number.isSafeInteger(id)||id<=0)continue;
        const item=document.createElement('div');item.className='section-link';
        const label=document.createElement('span');label.textContent=`削除待ち #${id}・試行 ${Number(row.attempts)||0}回`;
        const button=document.createElement('button');button.type='button';button.textContent='次回の再試行を予約';
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{
            const response=await fetch('/api/family-log-media-cleanup-admin',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,id})});
            if(!response.ok)throw new Error('retry failed');
            item.remove();if(!list.children.length)card.hidden=true;
          }catch{button.disabled=false;button.textContent='再試行できませんでした。';}
        });
        item.append(label,button);list.append(item);
      }
    }).catch(()=>{});
})();
