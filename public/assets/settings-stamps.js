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
  const MAX_UPLOAD_EDGE=384;
  const MAX_UPLOAD_BYTES=4*1024*1024;
  const MAX_SOURCE_BYTES=8*1024*1024;
  const MAX_NORMALIZED_BYTES=1024*1024;
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
    let sourceBytes=0;
    for(let index=0;index<files.length;index++){
      const file=files[index];
      if(!(file instanceof File)||file.type!=='image/png'||!/\.png$/i.test(file.name))throw new Error(`${index+1}枚目はPNGファイルを選択してください。`);
      if(file.size<=0||file.size>MAX_UPLOAD_BYTES)throw new Error(`${index+1}枚目は4MiB以下にしてください。`);
      sourceBytes+=file.size;
      if(sourceBytes>MAX_SOURCE_BYTES)throw new Error('選択したPNGの合計は8MiB以下にしてください。');
    }
  };

  const imageElementForFile=file=>new Promise((resolve,reject)=>{
    const objectUrl=URL.createObjectURL(file),image=new Image();
    image.onload=()=>resolve({drawable:image,width:Number(image.naturalWidth),height:Number(image.naturalHeight),cleanup:()=>URL.revokeObjectURL(objectUrl)});
    image.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error('PNGを読み込めませんでした。'));};
    image.src=objectUrl;
  });

  const decodedImage=async file=>{
    if(typeof createImageBitmap==='function'){
      try{
        const bitmap=await createImageBitmap(file);
        return {drawable:bitmap,width:Number(bitmap.width),height:Number(bitmap.height),cleanup:()=>{try{bitmap.close();}catch{}}};
      }catch{/* fall through to the HTMLImageElement decoder */}
    }
    return imageElementForFile(file);
  };

  const normalizeUploadFile=async(file,maxEdge=MAX_UPLOAD_EDGE)=>{
    let decoded=null;
    try{
      decoded=await decodedImage(file);
      const sourceWidth=Number(decoded.width),sourceHeight=Number(decoded.height);
      if(!Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight)||sourceWidth<=0||sourceHeight<=0)throw new Error('PNGの画像サイズを確認できませんでした。');
      const longEdge=Math.max(sourceWidth,sourceHeight);
      if(longEdge<=maxEdge)return {file,width:sourceWidth,height:sourceHeight};
      const scale=maxEdge/longEdge;
      const targetWidth=Math.max(1,Math.round(sourceWidth*scale)),targetHeight=Math.max(1,Math.round(sourceHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=targetWidth;canvas.height=targetHeight;
      const context=canvas.getContext('2d',{alpha:true});
      if(!context||typeof canvas.toBlob!=='function')throw new Error('このブラウザではPNGを共有用サイズへ変換できません。');
      context.clearRect(0,0,targetWidth,targetHeight);
      context.drawImage(decoded.drawable,0,0,targetWidth,targetHeight);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!(blob instanceof Blob)||blob.size<=0||blob.size>MAX_UPLOAD_BYTES)throw new Error('PNGを共有用サイズへ変換できませんでした。');
      return {file:new File([blob],file.name,{type:'image/png',lastModified:file.lastModified}),width:targetWidth,height:targetHeight};
    }finally{
      try{decoded?.cleanup?.();}catch{}
    }
  };

  const prepareUploadFiles=async files=>{
    let targetEdge=MAX_UPLOAD_EDGE;
    for(let pass=0;pass<10;pass++){
      const prepared=[];
      let normalizedBytes=0,commonWidth=0,commonHeight=0;
      for(let index=0;index<files.length;index++){
        setStatus(`共有用にPNGを最適化しています… ${index+1}/${files.length}（最大${targetEdge}px）`);
        const normalized=await normalizeUploadFile(files[index],targetEdge);
        if(!(normalized?.file instanceof File)||normalized.file.size<=0||normalized.file.size>MAX_UPLOAD_BYTES)throw new Error(`${index+1}枚目のPNGを最適化できませんでした。`);
        if(!Number.isSafeInteger(normalized.width)||!Number.isSafeInteger(normalized.height)||Math.max(normalized.width,normalized.height)>targetEdge)throw new Error(`${index+1}枚目の画像サイズを共有用に変換できませんでした。`);
        if(index===0){commonWidth=normalized.width;commonHeight=normalized.height;}
        else if(normalized.width!==commonWidth||normalized.height!==commonHeight)throw new Error('全フレームの画像サイズを揃えてください。');
        normalizedBytes+=normalized.file.size;
        prepared.push(normalized.file);
      }
      if(normalizedBytes<=MAX_NORMALIZED_BYTES){
        return {files:prepared,width:commonWidth,height:commonHeight,normalizedBytes};
      }
      if(targetEdge<=1)break;
      const ratio=Math.sqrt(MAX_NORMALIZED_BYTES/normalizedBytes)*0.92;
      const nextEdge=Math.max(1,Math.min(targetEdge-1,Math.floor(targetEdge*Math.min(0.9,ratio))));
      targetEdge=nextEdge;
      setStatus(`1MiBを超えたため、全フレームをさらに自動縮小しています…（最大${targetEdge}px）`);
    }
    throw new Error('自動最適化してもPNG合計を1MiB以下にできませんでした。フレーム数や画像内容を調整してください。');
  };

  const uploadFrames=async(files,token,durationMs)=>{
    const frames=[];
    for(let index=0;index<files.length;index++){
      setStatus(`PNGをアップロードしています… ${index+1}/${files.length}`);
      const uploadFile=files[index];
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

  const publishAsset=async(asset,button)=>{
    button.disabled=true;setInventoryStatus('みてにゃと共有しています…');
    try{
      const response=await fetch('/api/calendar-stamp-admin/shared-publish',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({csrf:csrf(),assetId:Number(asset.id)}),
      });
      let payload={};try{payload=await response.json();}catch{}
      if(!response.ok||payload?.ok!==true||payload?.sharedPublished!==true){
        const code=text(payload?.error);
        if(response.status===403||code==='ADMIN_REQUIRED'||code==='CSRF_FAILED')throw new Error('共有権限を確認して、ページを再読み込みしてください。');
        if(response.status===422||code==='SHARED_STAMP_INCOMPATIBLE')throw new Error('共有用サイズ条件（長辺384px・合計1MiB以下）を満たしていません。');
        if(response.status===503||code==='SHARED_STAMPS_UNAVAILABLE')throw new Error('共有スタンプ設定がまだ完了していません。');
        if(response.status===502||code==='SHARED_STAMPS_UPSTREAM_FAILED')throw new Error('共有サービスへ送信できませんでした。時間をおいて再試行してください。');
        throw new Error('スタンプを共有できませんでした。');
      }
      setInventoryStatus('共有しました。みてにゃでも利用できます。',true);await loadInventory();
    }catch(error){setInventoryStatus(error instanceof Error?error.message:'共有に失敗しました。');button.disabled=false;}
  };

  const renderInventory=(assets,sharedPublishingReady)=>{
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
      const metaParts=[asset.kind==='ANIMATED'?'アニメーション':'静止画',asset.active?'有効':'無効'];
      if(asset.sharedPublished===true)metaParts.push('共有済み');
      else if(asset.sharedPublishCandidate===true)metaParts.push(sharedPublishingReady?'共有可能':'共有設定待ち');
      const meta=document.createElement('div');meta.className='meta';meta.textContent=metaParts.join(' / ');info.append(meta);

      const actions=document.createElement('div');actions.style.display='flex';actions.style.gap='6px';actions.style.flexWrap='wrap';actions.style.justifyContent='flex-end';
      if(asset.canPublishShared===true){
        const publish=document.createElement('button');publish.type='button';publish.className='btn small';publish.textContent='みてにゃと共有';
        publish.addEventListener('click',()=>{void publishAsset(asset,publish);});actions.append(publish);
      }
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
      actions.append(button);row.append(info,actions);inventory.append(row);
    }
  };

  const loadInventory=async()=>{
    if(!inventory)return;
    try{
      const response=await fetch('/api/calendar-stamp-admin/assets',{credentials:'same-origin'});
      let payload={};try{payload=await response.json();}catch{}
      if(!response.ok||payload?.ok!==true||!Array.isArray(payload.assets))throw new Error('登録済みスタンプを読み込めませんでした。');
      renderInventory(payload.assets,payload.sharedPublishingReady===true);setInventoryStatus('');
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
    let frames=null,storageProvider='ASSETS',preparedUpload=null,width=null,height=null;
    try{
      if(files.length){
        validateUploadFiles(files);storageProvider='UPLOAD';preparedUpload=await prepareUploadFiles(files);width=preparedUpload.width;height=preparedUpload.height;
      }else{
        frames=parseFrames(data.get('frames'));
        const widthRaw=text(data.get('width')),heightRaw=text(data.get('height'));
        if(Boolean(widthRaw)!==Boolean(heightRaw))throw new Error('幅と高さは両方入力するか、両方空欄にしてください。');
        width=widthRaw?Number(widthRaw):null;height=heightRaw?Number(heightRaw):null;
        if((width!==null&&(!Number.isSafeInteger(width)||width<1||width>4096))||(height!==null&&(!Number.isSafeInteger(height)||height<1||height>4096)))throw new Error('幅と高さは1〜4096の整数で指定してください。');
      }
    }catch(error){setStatus(error instanceof Error?error.message:'フレームを確認してください。');return;}
    if(submit instanceof HTMLButtonElement)submit.disabled=true;
    try{
      if(storageProvider==='UPLOAD')frames=await uploadFrames(preparedUpload.files,token,durationMs);
      setStatus('スタンプとして登録しています…');
      const response=await fetch('/api/calendar-stamp-admin/png-sequence',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({csrf:token,name,storageProvider,frames,thumbnailStorageKey:storageProvider==='ASSETS'?(text(data.get('thumbnailStorageKey'))||null):null,width,height}),
      });
      let payload={};try{payload=await response.json();}catch{}
      if(response.ok&&payload&&payload.ok===true){
        if(payload.sharedPublished===true)setStatus('登録しました。FamilyToDoとみてにゃで共有できます。',true);
        else setStatus('登録しました。共有設定が完了している場合は、一覧の「みてにゃと共有」から再試行できます。',true);
        form.reset();await loadInventory();return;
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