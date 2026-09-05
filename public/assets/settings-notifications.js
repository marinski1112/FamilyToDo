(()=>{
  const payloadEl=document.getElementById('notificationSettingsPayload');
  let config={csrf:'',pushConfigured:false,pushPublicKey:'',pushCount:0,channel:'LINE'};
  try{if(payloadEl)config={...config,...JSON.parse(payloadEl.textContent||'{}')};}catch{}

  const form=document.getElementById('notificationForm');
  const status=document.getElementById('pushStatus');
  const enableBtn=document.getElementById('pushEnable');
  const testBtn=document.getElementById('pushTest');
  const disableBtn=document.getElementById('pushDisable');

  const setStatus=(message,kind='notice')=>{
    if(!status)return;
    status.textContent=message;
    status.className=kind==='error'?'error':'notice';
  };
  const setBusy=(busy)=>{[enableBtn,testBtn,disableBtn].forEach(btn=>{if(btn)btn.disabled=busy||(!config.pushConfigured&&btn!==disableBtn);});};
  const jsonPost=async(url,body)=>{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,...body})});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new Error(data?.error||'処理に失敗しました。');
    return data;
  };
  const base64ToBytes=(value)=>{
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64),out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  };
  const getRegistration=async()=>{
    if(!('serviceWorker' in navigator))throw new Error('このブラウザはService Workerに対応していません。');
    await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    return navigator.serviceWorker.ready;
  };
  const getExistingSubscription=async()=>{
    if(!('serviceWorker' in navigator))return null;
    const reg=await navigator.serviceWorker.ready.catch(()=>null);
    return reg?.pushManager?.getSubscription?reg.pushManager.getSubscription():null;
  };
  const updateLocalStatus=async()=>{
    if(!config.pushConfigured){setStatus('サーバー側のVAPID鍵が未設定です。','error');return;}
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
      setStatus('このブラウザではWeb Pushを利用できません。iPhone/iPadはSafariからホーム画面に追加したFamily TODOで開いてください。','error');return;
    }
    const sub=await getExistingSubscription().catch(()=>null);
    if(sub){setStatus(`この端末はWeb Push登録済みです。通知方法: ${config.channel==='WEB_PUSH'?'Web Push':'LINE'}`);}
    else if(Notification.permission==='denied'){setStatus('通知が端末設定で拒否されています。ブラウザ/ホーム画面アプリの通知設定を確認してください。','error');}
    else{setStatus('この端末ではまだWeb Pushを有効化していません。');}
  };

  if(form){
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const csrf=form.querySelector('[name="csrf"]')?.value||config.csrf||'';
      const body={
        csrf,
        enabled:form.querySelector('[name="enabled"]')?.checked??false,
        enabled_members:[...form.querySelectorAll('[name="enabled_members"]:checked')].map(x=>Number(x.value)),
        notification_channel:form.querySelector('[name="notification_channel"]')?.value||'WEB_PUSH',
        digest_enabled:form.querySelector('[name="digest_enabled"]')?.checked??false,
        digest_time:form.querySelector('[name="digest_time"]')?.value||'07:00',
        digest_members:[...form.querySelectorAll('[name="digest_members"]:checked')].map(x=>Number(x.value)),
        digest_tone:form.querySelector('[name="digest_tone"]')?.value||'FRIENDLY_LIGHT',
        digest_subjects:[...form.querySelectorAll('[name="digest_subjects"]:checked')].map(x=>Number(x.value))
      };
      const submit=form.querySelector('button[type="submit"],button:not([type])');
      if(submit)submit.disabled=true;
      try{
        const r=await fetch('/app/settings_notifications.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        const d=await r.json().catch(()=>null);
        if(!r.ok||!d?.ok)throw new Error(d?.error||'保存に失敗しました。');
        location.reload();
      }catch(err){alert(err instanceof Error?err.message:'保存に失敗しました。');}
      finally{if(submit)submit.disabled=false;}
    });
  }

  enableBtn?.addEventListener('click',async()=>{
    if(!config.pushConfigured)return;
    setBusy(true);setStatus('通知の許可を確認しています…');
    try{
      if(!('Notification' in window))throw new Error('このブラウザでは通知を利用できません。');
      const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
      if(permission!=='granted')throw new Error('通知が許可されませんでした。');
      const registration=await getRegistration();
      if(!registration.pushManager)throw new Error('このブラウザではPushManagerを利用できません。');
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){
        subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(String(config.pushPublicKey||''))});
      }
      await jsonPost('/api/push/subscribe',{subscription:subscription.toJSON()});
      const channel=form?.querySelector('[name="notification_channel"]');if(channel)channel.value='WEB_PUSH';
      config.channel='WEB_PUSH';config.pushCount=Number(config.pushCount||0)+1;
      setStatus('Web Pushを有効化しました。テスト通知で動作確認できます。');
    }catch(err){setStatus(err instanceof Error?err.message:'Web Pushを有効化できませんでした。','error');}
    finally{setBusy(false);}
  });

  testBtn?.addEventListener('click',async()=>{
    setBusy(true);setStatus('テスト通知を送信しています…');
    try{const d=await jsonPost('/api/push/test',{});setStatus(`テスト送信: ${(d.sent||0)+(d.failed||0)}台中 ${d.sent||0}台成功 / ${d.failed||0}台失敗`);setTimeout(()=>location.reload(),1200);}
    catch(err){setStatus(err instanceof Error?err.message:'テスト通知に失敗しました。','error');}
    finally{setBusy(false);}
  });

  disableBtn?.addEventListener('click',async()=>{
    setBusy(true);
    try{
      const sub=await getExistingSubscription();
      if(sub){await jsonPost('/api/push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe().catch(()=>{});}
      const channel=form?.querySelector('[name="notification_channel"]');if(channel)channel.value='LINE';
      config.channel='LINE';config.pushCount=0;
      setStatus('この端末のWeb Push登録を解除しました。通知方法はLINEへ戻します。');
    }catch(err){setStatus(err instanceof Error?err.message:'Web Pushを解除できませんでした。','error');}
    finally{setBusy(false);}
  });

  document.querySelectorAll('.push-remove').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('このWeb Push登録を解除しますか？'))return;
    btn.disabled=true;
    try{await jsonPost('/api/push/unsubscribe',{subscription_id:Number(btn.dataset.id)});btn.closest('[data-push-device]')?.remove();setStatus('登録を解除しました。');}
    catch(err){setStatus(err instanceof Error?err.message:'解除できませんでした。','error');btn.disabled=false;}
  }));

  updateLocalStatus().catch(()=>{});
  document.documentElement.dataset.pushSettingsJs='ready';
})();
