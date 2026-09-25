(()=>{
  'use strict';
  const form=document.getElementById('calendarStickerForm'),list=document.getElementById('calendarStickerInventory'),status=document.getElementById('calendarStickerStatus');
  if(!form||!list)return;
  let csrf='';try{csrf=String(JSON.parse(document.getElementById('calendarStickerAdminPayload')?.textContent||'{}').csrf||'');}catch{}
  const load=async()=>{
    const response=await fetch('/api/calendar-sticker-admin',{credentials:'same-origin',cache:'no-store'}),data=await response.json();
    if(!response.ok||!data.ok)throw Error('LOAD_FAILED');list.replaceChildren();
    for(const asset of data.assets||[]){
      const row=document.createElement('div');row.className='content-row';
      const image=document.createElement('img');image.src=asset.url;image.alt='';image.width=48;image.height=48;image.style.objectFit='contain';
      const label=document.createElement('span');label.textContent=asset.name;
      const button=document.createElement('button');button.type='button';button.className='btn gray small';button.textContent=asset.active?'無効にする':'再度有効にする';
      button.addEventListener('click',async()=>{button.disabled=true;try{const r=await fetch('/api/calendar-sticker-admin',{method:'PATCH',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'same-origin',body:JSON.stringify({assetId:asset.id,active:!asset.active})});if(!r.ok)throw Error();await load();}catch{status.textContent='更新できませんでした。';button.disabled=false;}});
      row.append(image,label,button);list.appendChild(row);
    }
    if(!data.assets?.length)list.textContent='登録済みステッカーはありません。';
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();const file=form.elements.image?.files?.[0],name=String(form.elements.name?.value||'').trim(),button=form.querySelector('button[type=submit]');
    if(!file||!name||!csrf)return;
    if(file.type!=='image/png'||file.size>4*1024*1024){status.textContent='4MiB以下のPNGを選んでください。';return;}
    button.disabled=true;status.textContent='登録しています…';
    try{
      const response=await fetch('/api/calendar-sticker-admin',{method:'POST',credentials:'same-origin',headers:{'content-type':'image/png','x-csrf-token':csrf,'x-sticker-name':encodeURIComponent(name)},body:file});
      if(!response.ok)throw Error();form.reset();await load();status.textContent='登録しました。';
    }catch{status.textContent='登録できませんでした。画像を確認して再試行してください。';}
    finally{button.disabled=false;}
  });
  load().catch(()=>{status.textContent='一覧を読み込めませんでした。';});
})();
