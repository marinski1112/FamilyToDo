(()=>{
  'use strict';

  const form=document.getElementById('calendarStampSequenceForm');
  if(!(form instanceof HTMLFormElement))return;
  const status=document.getElementById('calendarStampSequenceStatus');
  const submit=form.querySelector('button[type="submit"]');
  const inventory=document.getElementById('calendarStampInventory');
  const inventoryStatus=document.getElementById('calendarStampInventoryStatus');
  const text=value=>String(value??'').trim();
  const csrf=()=>text(new FormData(form).get('csrf'));
  const MAX_UPLOAD_EDGE=512;
  const MAX_UPLOAD_BYTES=4*1024*1024;
  const setStatus=(message,ok=false)=>{
    if(!status)return;
    status.textContent=message;
    status.dataset.state=ok?'success':'error';
  };
  const setInventoryStatus=(message,ok=false)=>{
    if(!inventoryStatus)return;
    inventoryStatus.textContent=message;
    inventoryStatus.dataset.state=ok?'success':'error';
  };

  const parseFrames=value=>{
    const lines=String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(lines.length<2||lines.length>48)throw new Error('フレームは2〜48行で入力してください。');
    return lines.map((line,index)=>{
      let storageKey=line,durationMs=120;
      const comma=line.lastIndexOf(',');
      if(comma>0){
        const suffix=line.slice(comma+1).trim();
        if(/^\d+$/.test(suffix)){
          storageKey=line.slice(0,comma).trim();
          durationMs=Number(suffix);
        }
      }
      if(!storageKey||!/\.png$/i.test(storageKey))throw new Error(`${index+1}行目のPNGパスを確認してください。`);
      if(!Number.isSafeInteger(durationMs)||durationMs<40||durationMs>2000)throw new Error(`${index+1}行目の表示時間は40〜2000msで指定してください。`);
      return {storageKey,durationMs};
    });
  };

  const selectedFiles=()=>{
    const input=form.elements.namedItem('pngFrames');
    if(!(input instanceof HTMLInputElement)||!input.files)return [];
    return Array.from(input.files);
  };

  const validateUploadFiles=files=>{
    if(files.length<2||files.length>48)throw new Error('PNGファイルは2〜48枚選択してください。');
    for(let index=0;index<files.length;index++){
      const file=files[index];
      if(!(file instanceof File)||file.type!=='image/png'||!/\.png$/i.test(file.name))throw new Error(`${index+1}枚目はPNGファイルを選択してください。`);
      if(file.size<=0||file.size>MAX_UPLOAD_BYTES)throw new Error(`${index+1}枚目は4MiB以下にしてください。`);
    }
  };

  const normalizeUploadFile=async file=>{
    if(typeof createImageBitmap!=='function')return file;
    let bitmap=null;
    try{
      bitmap=await createImageBitmap(file);
      const sourceWidth=Number(bitmap.width),sourceHeight=Number(bitmap.height);
      if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||sourceWidth<=0||sourceHeight<=0)return file;
      const longEdge=Math.max(sourceWidth,sourceHeight);
      if(longEdge<=MAX_UPLOAD_EDGE)return file;
      const scale=MAX_UPLOAD_EDGE/longEdge;
      const targetWidth=Math.max(1,Math.round(sourceWidth*scale)),targetHeight=Math.max(1,Math.round(sourceHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=targetWidth;canvas.height=targetHeight;
      const context=canvas.getContext('2d',{alpha:true});
      if(!context||typeof canvas.toBlob!=='function')return file;
      context.clearRect(0,0,targetWidth,targetHeight);
      context.drawImage(bitmap,0,0,targetWidth,targetHeight);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!(blob instanceof Blob)||blob.size<=0||blob.size>MAX_UPLOAD_BYTES)return file;
      return new File([blob],file.name,{type:'image/png',lastModified:file.lastModified});
    }catch{
      return file;
    }finally{
      try{bitmap?.close?.();}catch{}
    }
  };

  const uploadFrames=async(files,token,durationMs)=>{
    const frames=[];
    for(let index=0;index<files.length;index++){
      setStatus(`PNGを最適化・アップロードしています… ${index+1}/${files.length}`);
      const uploadFile=await normalizeUploadFile(files[index]);
      const response=await fetch('/api/calendar-stamp-admin/upload',{
        method:'POST',
        credentials:'same-origin',
        headers:{'content-type':'image/png','x-csrf-token':token},
        body:uploadFile,
      });
      let payload={};
      try{payload=await response.json();}catch{}
      if(!response.ok||payload?.ok!==true||!text(payload?.storageKey)){
        const code=text(payload?.error);
        if(response.status===413||code==='FILE_TOO_LARGE')throw new Error(`${index+1}枚目が大きすぎます。1枚4MiB以下にしてください。`);
        if(response.status===415||code==='PNG_REQUIRED'||code==='INVALID_PNG')throw new Error(`${index+1}枚目のPNGを確認してください。`);
        if(response.status===403||code==='ADMIN_REQUIRED'||code==='CSRF_FAILED')throw new Error('登録権限を確認して、ページを再読み込みしてください。');
        throw new Error(`${index+1}枚目のアップロードに失敗しました。`);
      }
      frames.push({storageKey:text(payload.storageKey),durationMs});
    }
    return frames;
  };

  const renderInventory=assets=>{
    if(!inventory)return;
    inventory.replaceChildren();
    if(!assets.length){
      const empty=document.createElement('p');empty.className='small';empty.textContent='登録済みスタンプはありません。';inventory.append(empty);return;
    }
    for(const asset of assets){
      const row=document.createElement('div');row.className='content-row';
      const info=document.createElement('div');
      if(asset.active&&text(asset.thumbnailUrl)){
        const image=document.createElement('img');image.src=text(asset.thumbnailUrl);image.alt='';image.width=48;image.height=48;image.loading='lazy';image.style.objectFit='contain';image.style.marginRight='10px';image.style.verticalAlign='middle';info.append(image);
      }
      const name=document.createElement('strong');name.textContent=text(asset.name)||`スタンプ #${asset.id}`;info.append(name);
      const meta=document.createElement('div');meta.className='meta';meta.textContent=`${asset.kind==='ANIMATED'?'アニメーション':'静止画'} / ${asset.active?'有効':'無効'}`;info.append(meta);
      const button=document.createElement('button');button.type='button';button.className='btn gray small';button.textContent=asset.active?'無効化':'有効化';
      button.addEventListener('click',async()=>{
        button.disabled=true;setInventoryStatus(asset.active?'無効化しています…':'有効化しています…');
        try{
          const response=await fetch('/api/calendar-stamp-admin/assets',{
            method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
            body:JSON.stringify({csrf:csrf(),assetId:Number(asset.id),active:!asset.active}),
          });
          let payload={};try{payload=await response.json();}catch{}
          if(!response.ok||payload?.ok!==true){
            const code=text(payload?.error);
            if(response.status===403||code==='ADMIN_REQUIRED'||code==='CSRF_FAILED')throw new Error('操作権限を確認して、ページを再読み込みしてください。');
            throw new Error('スタンプの状態変更に失敗しました。');
          }
          setInventoryStatus('更新しました。',true);await loadInventory();
        }catch(error){setInventoryStatus(error instanceof Error?error.message:'通信に失敗しました。');button.disabled=false;}
      });
      row.append(info,button);inventory.append(row);
    }
  };

  const loadInventory=async()=>{
    if(!inventory)return;
    try{
      const response=await fetch('/api/calendar-stamp-admin/assets',{credentials:'same-origin'});
      let payload={};try{payload=await response.json();}catch{}
      if(!response.ok||payload?.ok!==true||!Array.isArray(payload.assets))throw new Error('登録済みスタンプを読み込めませんでした。');
      renderInventory(payload.assets);setInventoryStatus('');
    }catch(error){
      inventory.replaceChildren();const p=document.createElement('p');p.className='small';p.textContent=error instanceof Error?error.message:'登録済みスタンプを読み込めませんでした。';inventory.append(p);
    }
  };

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const name=text(data.get('name'));
    if(!name){setStatus('スタンプ名を入力してください。');return;}
    const token=text(data.get('csrf'));
    const files=selectedFiles();
    const durationMs=Number(text(data.get('durationMs'))||120);
    if(!Number.isSafeInteger(durationMs)||durationMs<40||durationMs>2000){setStatus('表示時間は40〜2000msで指定してください。');return;}
    let frames=null,storageProvider='ASSETS';
    try{
      if(files.length){validateUploadFiles(files);storageProvider='UPLOAD';}
      else frames=parseFrames(data.get('frames'));
    }catch(error){setStatus(error instanceof Error?error.message:'フレームを確認してください。');return;}
    const widthRaw=text(data.get('width')),heightRaw=text(data.get('height'));
    if(Boolean(widthRaw)!==Boolean(heightRaw)){setStatus('幅と高さは両方入力するか、両方空欄にしてください。');return;}
    const width=widthRaw?Number(widthRaw):null,height=heightRaw?Number(heightRaw):null;
    if((width!==null&&(!Number.isSafeInteger(width)||width<1||width>4096))||(height!==null&&(!Number.isSafeInteger(height)||height<1||height>4096))){
      setStatus('幅と高さは1〜4096の整数で指定してください。');return;
    }
    if(submit instanceof HTMLButtonElement)submit.disabled=true;
    try{
      if(storageProvider==='UPLOAD')frames=await uploadFrames(files,token,durationMs);
      setStatus('スタンプとして登録しています…');
      const response=await fetch('/api/calendar-stamp-admin/png-sequence',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({csrf:token,name,storageProvider,frames,thumbnailStorageKey:storageProvider==='ASSETS'?(text(data.get('thumbnailStorageKey'))||null):null,width,height}),
      });
      let payload={};try{payload=await response.json();}catch{}
      if(response.ok&&payload&&payload.ok===true){
        setStatus('登録しました。カレンダーと伝言のスタンプ候補に表示されます。',true);form.reset();await loadInventory();return;
      }
      const code=text(payload?.error);
      if(response.status===403||code==='ADMIN_REQUIRED'||code==='CSRF_FAILED')setStatus('登録権限を確認して、ページを再読み込みしてください。');
      else if(response.status===400||code==='INVALID_BODY'||code==='INVALID_SEQUENCE')setStatus('入力内容を確認してください。');
      else setStatus('スタンプの登録に失敗しました。');
    }catch(error){setStatus(error instanceof Error?error.message:'通信に失敗しました。時間をおいて再試行してください。');}
    finally{if(submit instanceof HTMLButtonElement)submit.disabled=false;}
  });

  void loadInventory();
})();