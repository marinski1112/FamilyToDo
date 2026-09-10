(()=>{
  'use strict';
  const root=document.getElementById('locationArrivalCard');if(!root)return;
  const payload=JSON.parse(document.getElementById('settingsLocationPayload')?.textContent||'{}');
  const enabled=document.getElementById('locationArrivalEnabled'),status=document.getElementById('locationArrivalStatus'),list=document.getElementById('locationPlaceList'),recent=document.getElementById('locationArrivalRecent');
  let busy=false;
  const request=async body=>{
    const r=await fetch('/api/location/places',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(body?{'content-type':'application/json','x-csrf-token':payload.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'設定を取得できませんでした。');return d;
  };
  const load=async()=>{
    const d=await request();enabled.checked=d.enabled;
    status.textContent=d.pushReady?(d.enabled?'接近・出発通知はONです。':'接近・出発通知はOFFです。'):'先に「Push通知の設定」で、この端末の通知を有効にしてください。';
    list.replaceChildren();
    for(const place of d.places){
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin:8px 0;overflow-wrap:anywhere';
      const name=document.createElement('span');name.style.flex='1';name.textContent=place.label;row.append(name);
      if(payload.isAdmin&&place.key.startsWith('N:')){const button=document.createElement('button');button.type='button';button.className='btn gray small';button.textContent='削除';button.setAttribute('aria-label',place.label+'を削除');button.addEventListener('click',()=>{if(confirm(place.label+'を削除しますか？'))void mutate({action:'delete',key:place.key});});row.append(button);}
      list.append(row);
    }
    recent.replaceChildren();for(const item of d.recent){const row=document.createElement('p');row.className='small';const event=item.event_type==='APPROACH'?'接近':item.event_type==='LEAVE'?'出発':'旧到着';row.textContent=item.created_at+' UTC · '+event+' · '+({SENT:'送信受付済み',FAILED:'送信失敗',ATTEMPTED:'送信結果を確認できません'}[item.status]||'不明');recent.append(row);}
    if(!d.recent.length)recent.textContent='まだ通知履歴はありません。';
  };
  const mutate=async body=>{
    if(busy)return;busy=true;enabled.disabled=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await request(body);await load();}catch(e){status.textContent=e.message;}
    finally{busy=false;enabled.disabled=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  enabled.addEventListener('change',()=>void mutate({action:'preference',enabled:enabled.checked}));
  document.getElementById('locationPlaceCapture')?.addEventListener('click',()=>void mutate({action:'capture',label:document.getElementById('locationPlaceLabel').value,sourceMemberId:Number(document.getElementById('locationPlaceMember').value)}));
  load().catch(e=>{status.textContent=e.message;});
})();
