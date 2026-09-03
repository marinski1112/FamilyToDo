(()=>{
  'use strict';

  const form=document.getElementById('calendarStampSequenceForm');
  if(!(form instanceof HTMLFormElement))return;
  const status=document.getElementById('calendarStampSequenceStatus');
  const submit=form.querySelector('button[type="submit"]');
  const text=value=>String(value??'').trim();
  const setStatus=(message,ok=false)=>{
    if(!status)return;
    status.textContent=message;
    status.dataset.state=ok?'success':'error';
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

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const name=text(data.get('name'));
    if(!name){setStatus('スタンプ名を入力してください。');return;}
    let frames;
    try{frames=parseFrames(data.get('frames'));}catch(error){setStatus(error instanceof Error?error.message:'フレームを確認してください。');return;}
    const widthRaw=text(data.get('width')),heightRaw=text(data.get('height'));
    if(Boolean(widthRaw)!==Boolean(heightRaw)){setStatus('幅と高さは両方入力するか、両方空欄にしてください。');return;}
    const width=widthRaw?Number(widthRaw):null,height=heightRaw?Number(heightRaw):null;
    if((width!==null&&(!Number.isSafeInteger(width)||width<1||width>4096))||(height!==null&&(!Number.isSafeInteger(height)||height<1||height>4096))){
      setStatus('幅と高さは1〜4096の整数で指定してください。');return;
    }
    if(submit instanceof HTMLButtonElement)submit.disabled=true;
    setStatus('登録しています…');
    try{
      const response=await fetch('/api/calendar-stamp-admin/png-sequence',{
        method:'POST',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          csrf:text(data.get('csrf')),
          name,
          frames,
          thumbnailStorageKey:text(data.get('thumbnailStorageKey'))||null,
          width,
          height,
        }),
      });
      let payload={};
      try{payload=await response.json();}catch{}
      if(response.ok&&payload&&payload.ok===true){
        setStatus('登録しました。カレンダーのスタンプ候補に表示されます。',true);
        form.reset();
        return;
      }
      const code=text(payload?.error);
      if(response.status===403||code==='ADMIN_REQUIRED'||code==='CSRF_FAILED')setStatus('登録権限を確認して、ページを再読み込みしてください。');
      else if(response.status===400||code==='INVALID_BODY'||code==='INVALID_SEQUENCE')setStatus('入力内容を確認してください。');
      else setStatus('スタンプの登録に失敗しました。');
    }catch{
      setStatus('通信に失敗しました。時間をおいて再試行してください。');
    }finally{
      if(submit instanceof HTMLButtonElement)submit.disabled=false;
    }
  });
})();
