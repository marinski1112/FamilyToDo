(()=>{
  'use strict';

  const root=document.querySelector('[data-location-history-panel]');
  if(!root)return;

  const memberEl=root.querySelector('[data-location-history-member]');
  const loadEl=root.querySelector('[data-location-history-load]');
  const statusEl=root.querySelector('[data-location-history-status]');
  const summaryEl=root.querySelector('[data-location-history-summary]');
  const linksEl=root.querySelector('[data-location-history-links]');
  let membersLoaded=false;

  const setStatus=(text)=>{if(statusEl)statusEl.textContent=text;};
  const formatTime=(value)=>{
    const date=new Date(value);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(date):'';
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
  const yesterdayRangeJst=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
    const todayJstMidnightUtc=Date.UTC(values.year,values.month-1,values.day)-9*60*60*1000;
    return {
      from:new Date(todayJstMidnightUtc-24*60*60*1000).toISOString(),
      to:new Date(todayJstMidnightUtc-1).toISOString(),
    };
  };

  const loadMembers=async()=>{
    if(membersLoaded)return;
    const response=await fetch('/api/location/latest',{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error('家族一覧を取得できませんでした。');
    const members=(Array.isArray(payload.members)?payload.members:[]).filter(member=>member?.sharingEnabled&&Number.isSafeInteger(Number(member?.memberId))&&Number(member.memberId)>0);
    memberEl.replaceChildren();
    if(!members.length){
      const option=document.createElement('option');
      option.value='';
      option.textContent='共有中の家族がいません';
      memberEl.append(option);
      memberEl.disabled=true;
      throw new Error('昨日の履歴を参照できる共有中メンバーがいません。');
    }
    for(const member of members){
      const option=document.createElement('option');
      option.value=String(member.memberId);
      option.textContent=String(member.name||'家族');
      memberEl.append(option);
      if(member.isViewer)option.selected=true;
    }
    memberEl.disabled=false;
    membersLoaded=true;
  };

  const renderLinks=(points)=>{
    if(!linksEl)return;
    linksEl.replaceChildren();
    if(!points.length)return;
    const firstUrl=mapsLink(points[0]),lastUrl=mapsLink(points[points.length-1]);
    for(const [label,url] of [['開始地点をGoogle Mapsで開く',firstUrl],['終了地点をGoogle Mapsで開く',lastUrl]]){
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
    if(!loadEl||!memberEl)return;
    loadEl.disabled=true;
    if(summaryEl)summaryEl.textContent='';
    if(linksEl)linksEl.replaceChildren();
    try{
      setStatus('昨日の移動を確認しています…');
      await loadMembers();
      const memberId=Number(memberEl.value);
      if(!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('家族を選択してください。');
      const range=yesterdayRangeJst();
      const params=new URLSearchParams({memberId:String(memberId),from:range.from,to:range.to});
      const response=await fetch(`/api/location/history?${params.toString()}`,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(typeof payload?.error==='string'?payload.error:'昨日の移動を取得できませんでした。');
      const points=Array.isArray(payload.points)?payload.points:[];
      if(!points.length){
        setStatus('昨日の位置履歴はありません。');
        return;
      }
      let meters=0;
      for(let i=1;i<points.length;i+=1)meters+=distanceMeters(points[i-1],points[i]);
      const start=formatTime(points[0]?.recordedAt),end=formatTime(points[points.length-1]?.recordedAt);
      setStatus(`昨日の記録 ${points.length}件${start&&end?` ・ ${start}〜${end}`:''}`);
      if(summaryEl)summaryEl.textContent=`記録点間の直線距離合計 ${distanceText(meters)}。GPS誤差を含むため実際の移動距離とは異なる場合があります。`;
      renderLinks(points);
    }catch(error){
      setStatus(error instanceof Error&&error.message?error.message:'昨日の移動を取得できませんでした。');
    }finally{
      loadEl.disabled=false;
    }
  };

  if(loadEl)loadEl.addEventListener('click',()=>void loadHistory());
})();
