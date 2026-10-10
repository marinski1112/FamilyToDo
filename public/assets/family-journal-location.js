(()=>{
  'use strict';
  const button=document.getElementById('journalLocationNames'),status=document.getElementById('journalLocationNamesStatus');
  if(!button||!status)return;
  let payload;try{payload=JSON.parse(document.getElementById('journalLocationPayload')?.textContent||'{}');}catch{return;}
  const homeOrWork=place=>/^(自宅|家|我が家|職場|会社|勤務先)(付近.*)?$/.test(String(place||''));
  const coarseAddress=result=>{
    const components=Array.isArray(result?.address_components)?result.address_components:[];
    const byType=type=>String(components.find(c=>Array.isArray(c?.types)&&c.types.includes(type))?.long_name||'').trim();
    return ['administrative_area_level_1','locality','sublocality_level_1','sublocality_level_2','sublocality_level_3','sublocality_level_4'].map(byType).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('').slice(0,120);
  };
  let geocoderPromise=null;
  const loadGeocoder=()=>{
    if(geocoderPromise)return geocoderPromise;
    geocoderPromise=(async()=>{
      if(!window.google?.maps){
        if(!payload.mapsKey)throw new Error('地図の設定がないため、位置名を取得できません。');
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script'),callback='__familyJournalMapsReady';
          const finish=error=>{clearTimeout(timer);delete window[callback];if(error){script.remove();reject(error);}else resolve();};
          const timer=setTimeout(()=>finish(new Error('地図を読み込めませんでした。再試行してください。')),15000);
          window[callback]=()=>finish();script.onerror=()=>finish(new Error('地図を読み込めませんでした。再試行してください。'));
          script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:payload.mapsKey,loading:'async',callback});script.async=true;document.head.append(script);
        });
      }
      const maps=window.google?.maps;
      const Geocoder=maps?.Geocoder||(await maps?.importLibrary?.('geocoding'))?.Geocoder;
      if(typeof Geocoder!=='function')throw new Error('位置名を取得できませんでした。再試行してください。');
      return new Geocoder();
    })().catch(error=>{geocoderPromise=null;throw error;});return geocoderPromise;
  };
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;status.textContent='位置名を確認しています…';
    let saved=0,unresolved=0,lookups=0,writes=0;
    const cache=new Map();
    try{
      for(const memberId of (Array.isArray(payload.members)?payload.members:[]).slice(0,20)){
        const params=new URLSearchParams({memberId:String(memberId),date:String(payload.date||'')});
        const response=await fetch('/api/location/history?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
        const history=await response.json();if(!response.ok||!history?.ok){unresolved++;continue;}
        for(const entry of (Array.isArray(history.report)?history.report:[])){
          if(entry.kind!=='STAY'||homeOrWork(entry.place))continue;
          const id=Number(entry.archiveStayId);if(!Number.isSafeInteger(id)||id<=0){unresolved++;continue;}
          let address=typeof entry.address==='string'?entry.address.trim():'';
          if(!address){
            const lat=entry.anchor?.latitude,lng=entry.anchor?.longitude;
            if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){unresolved++;continue;}
            const key=lat.toFixed(4)+','+lng.toFixed(4);
            if(cache.has(key))address=cache.get(key);
            else{
              if(lookups>=20){unresolved++;continue;}lookups++;
              const geocoder=await loadGeocoder();
              let result;try{result=await geocoder.geocode({location:{lat,lng},language:'ja',region:'JP'});}catch{unresolved++;continue;}
              address=coarseAddress(result?.results?.[0]);cache.set(key,address);
            }
          }
          if(!address){unresolved++;continue;}
          if(writes>=20){unresolved++;continue;}writes++;
          const write=await fetch('/api/location/stay-address',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':String(payload.csrf||'')},body:JSON.stringify({archiveStayId:id,addressLabel:address}),signal:AbortSignal.timeout(15000)});
          if(!write.ok){unresolved++;continue;}saved++;
        }
      }
      status.textContent=saved?`位置名を${saved}件保存しました。日誌を再読み込みすると反映されます。${unresolved?'取得できない記録が残っています。':''}`:'更新できる位置名がありませんでした。位置共有・地図の設定や滞在記録を確認してください。';
      if(saved){const link=document.createElement('a');link.href=window.location.href;link.textContent='日誌を再読み込み';link.className='btn gray small';status.append(' ',link);}
    }catch{status.textContent=saved?'一部の位置名は保存しましたが、確認を完了できませんでした。再読み込みまたは再試行してください。':'位置名を確認できませんでした。地図の設定・通信状態を確認して再試行してください。';}
    finally{button.disabled=false;}
  });
})();
