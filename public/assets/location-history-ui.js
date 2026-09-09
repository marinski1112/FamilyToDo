(()=>{
  'use strict';

  const root=document.querySelector('[data-location-history-panel]');
  if(!root)return;

  const memberEl=root.querySelector('[data-location-history-member]');
  const loadEl=root.querySelector('[data-location-history-load]');
  const statusEl=root.querySelector('[data-location-history-status]');
  const summaryEl=root.querySelector('[data-location-history-summary]');
  const linksEl=root.querySelector('[data-location-history-links]');
  const fromEl=root.querySelector('[data-location-history-from]');
  const toEl=root.querySelector('[data-location-history-to]');
  let membersLoaded=false;
  let latestMembers=null;
  let loadingHistory=false;
  let historyRequest=0,displayedMemberId=0;
  const liveRoot=root.closest('[data-location-live]');
  const emitHistory=(memberId=0,points=[])=>liveRoot?.dispatchEvent(new CustomEvent('family-location-history',{detail:{memberId,points}}));
  const clearDisplay=()=>{historyRequest++;displayedMemberId=0;emitHistory();if(summaryEl)summaryEl.textContent='';linksEl?.replaceChildren();};
  liveRoot?.addEventListener('family-location-latest',event=>{
    latestMembers=event.detail?.members||[];membersLoaded=false;
    if(displayedMemberId&&!latestMembers.some(member=>Number(member.memberId)===displayedMemberId&&member.sharingEnabled)){clearDisplay();setStatus('位置共有が停止されたため、履歴を非表示にしました。');}
    if(!loadingHistory)void loadMembers().catch(()=>{});
  });
  root.querySelector('[data-location-history-clear]')?.addEventListener('click',()=>{clearDisplay();setStatus('地図の軌跡を消しました。');});

  const setStatus=(text)=>{if(statusEl)statusEl.textContent=text;};
  const formatTime=(value)=>{
    const date=new Date(value);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date):'';
  };
  const distanceMeters=(a,b)=>{
    const lat1=Number(a?.latitude),lng1=Number(a?.longitude),lat2=Number(b?.latitude),lng2=Number(b?.longitude);
    if(![lat1,lng1,lat2,lng2].every(Number.isFinite))return 0;
    const rad=Math.PI/180,earth=6371000;
    const dLat=(lat2-lat1)*rad,dLng=(lng2-lng1)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLng/2)**2;
    return 2*earth*Math.asin(Math.min(1,Math.sqrt(h)));
  };
  const distanceText=(meters)=>meters<1000?`約${Math.round(meters)}m`:`約${(meters/1000).toFixed(meters<10000?1:0)}km`;
  const mapsLink=(point)=>{
    const lat=Number(point?.latitude),lng=Number(point?.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  };
  const todayJst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateMs=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
    const ms=Date.parse(value+'T00:00:00+09:00');
    return Number.isFinite(ms)&&new Date(ms+9*3600000).toISOString().slice(0,10)===value?ms:NaN;
  };
  const setDays=days=>{
    const today=todayJst();
    toEl.value=today;
    fromEl.value=new Date(dateMs(today)-(days-1)*86400000+9*3600000).toISOString().slice(0,10);
  };
  const selectedRange=()=>{
    const from=dateMs(fromEl.value),last=dateMs(toEl.value),today=dateMs(todayJst());
    if(!Number.isFinite(from)||!Number.isFinite(last)||from>last||last-from>=31*86400000||last>today)throw new Error('開始日・終了日を確認してください。今日までの最大31日間を選べます。');
    return {from:new Date(from).toISOString(),to:new Date(last+86400000-1).toISOString()};
  };
  if(fromEl&&toEl){fromEl.max=toEl.max=todayJst();setDays(7);}
  root.querySelectorAll('[data-location-history-days]').forEach(button=>button.addEventListener('click',()=>{
    setDays(Number(button.dataset.locationHistoryDays));clearDisplay();setStatus('期間を変更しました。「地図に表示」を押してください。');
  }));
  [fromEl,toEl,memberEl].forEach(input=>input?.addEventListener('change',()=>{clearDisplay();setStatus('条件を変更しました。「地図に表示」を押してください。');}));

  const loadMembers=async()=>{
    if(membersLoaded)return;
    let payload={ok:true,members:latestMembers};
    if(!latestMembers){
      const response=await fetch('/api/location/latest',{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
      payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error('家族一覧を取得できませんでした。');
      // Let the map validate history when its initial latest request failed.
      latestMembers=Array.isArray(payload.members)?payload.members:[];
      liveRoot?.dispatchEvent(new CustomEvent('family-location-members',{detail:{members:latestMembers}}));
    }
    const selected=memberEl.value;
    const members=(Array.isArray(payload.members)?payload.members:[]).filter(member=>member?.sharingEnabled&&Number.isSafeInteger(Number(member?.memberId))&&Number(member.memberId)>0);
    memberEl.replaceChildren();
    if(!members.length){
      const option=document.createElement('option');
      option.value='';
      option.textContent='共有中の家族がいません';
      memberEl.append(option);
      memberEl.disabled=true;
      throw new Error('選択期間の履歴を参照できる共有中メンバーがいません。');
    }
    for(const member of members){
      const option=document.createElement('option');
      option.value=String(member.memberId);
      option.textContent=String(member.name||'家族');
      memberEl.append(option);
      if(selected?String(member.memberId)===selected:member.isViewer)option.selected=true;
    }
    memberEl.disabled=false;
    membersLoaded=true;
  };

  const renderLinks=(points,truncated)=>{
    if(!linksEl)return;
    linksEl.replaceChildren();
    if(!points.length)return;
    const firstUrl=mapsLink(points[0]),lastUrl=mapsLink(points[points.length-1]);
    const firstLabel=truncated?'取得範囲の開始地点をGoogle Mapsで開く':'開始地点をGoogle Mapsで開く';
    const lastLabel=truncated?'取得範囲の終了地点をGoogle Mapsで開く':'終了地点をGoogle Mapsで開く';
    for(const [label,url] of [[firstLabel,firstUrl],[lastLabel,lastUrl]]){
      if(!url)continue;
      const link=document.createElement('a');
      link.className='btn gray small';
      link.href=url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent=label;
      linksEl.append(link);
    }
  };

  const loadHistory=async()=>{
    if(!loadEl||!memberEl||loadingHistory)return;
    loadingHistory=true;
    const requestId=++historyRequest;
    loadEl.disabled=true;
    emitHistory();
    if(summaryEl)summaryEl.textContent='';
    if(linksEl)linksEl.replaceChildren();
    let selectorLocked=false;
    try{
      setStatus('選択期間の移動を確認しています…');
      await loadMembers();
      if(requestId!==historyRequest)return;
      const memberId=Number(memberEl.value);
      const memberName=String(memberEl.selectedOptions?.[0]?.textContent||'家族');
      if(!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('家族を選択してください。');
      memberEl.disabled=true;
      selectorLocked=true;
      const range=selectedRange();
      const rangeLabel=fromEl.value+'〜'+toEl.value;
      const params=new URLSearchParams({memberId:String(memberId),from:range.from,to:range.to});
      const response=await fetch(`/api/location/history?${params.toString()}`,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>null);
      if(requestId!==historyRequest)return;
      if(!response.ok||!payload?.ok)throw new Error(typeof payload?.error==='string'?payload.error:'選択期間の移動を取得できませんでした。');
      if(latestMembers&&!latestMembers.some(member=>Number(member.memberId)===memberId&&member.sharingEnabled))throw new Error('位置共有が停止されました。');
      if(Number(memberEl.value)!==memberId)throw new Error('選択した家族が変更されたため、もう一度確認してください。');
      const points=Array.isArray(payload.points)?payload.points:[];
      if(!points.length){
        setStatus(`${memberName}・選択期間の位置履歴はありません。`);
        return;
      }
      const limit=Number(payload.limit);
      const truncated=Number.isSafeInteger(limit)&&limit>0&&points.length>=limit;
      let meters=0;
      for(let i=1;i<points.length;i+=1){if(Date.parse(points[i].recordedAt)-Date.parse(points[i-1].recordedAt)<=3600000)meters+=distanceMeters(points[i-1],points[i]);}
      const start=formatTime(points[0]?.recordedAt),end=formatTime(points[points.length-1]?.recordedAt);
      const countText=truncated?`${points.length}件以上（最新${points.length}件のみ表示）`:`${points.length}件`;
      setStatus(`${memberName}・${rangeLabel}の記録 ${countText}${start&&end?` ・ ${start}〜${end}`:''}`);
      if(summaryEl){
        summaryEl.textContent=truncated
          ?`取得できた最新${points.length}件の記録点間の直線距離合計 ${distanceText(meters)}。上限に達したため選択期間全体の距離・開始地点とは限りません。期間を短くすると前の記録を確認できます。GPS誤差も含みます。`
          :`記録点間の直線距離合計 ${distanceText(meters)}。1時間を超える記録の空白は線で結びません。道路経路や実際の移動距離とは異なります。`;
      }
      renderLinks(points,truncated);
      displayedMemberId=memberId;
      emitHistory(memberId,points);
      const sheet=liveRoot?.querySelector('[data-location-family-sheet]');if(sheet){sheet.open=false;sheet.querySelector('summary')?.focus({preventScroll:true});}
    }catch(error){
      if(requestId===historyRequest)setStatus(error instanceof Error&&error.message?error.message:'選択期間の移動を取得できませんでした。');
    }finally{
      loadingHistory=false;
      if(selectorLocked)memberEl.disabled=false;
      if(latestMembers&&!membersLoaded)void loadMembers().catch(()=>{});
      loadEl.disabled=false;
    }
  };

  if(loadEl)loadEl.addEventListener('click',()=>void loadHistory());
})();
