(()=>{
  'use strict';

  const root=document.querySelector('[data-location-live]');
  if(!root)return;

  const statusEl=root.querySelector('[data-location-status]');
  const listEl=root.querySelector('[data-location-list]');
  const mapEl=root.querySelector('[data-location-map]');
  const mapStateEl=root.querySelector('[data-location-map-state]');
  const refreshEl=root.querySelector('[data-location-refresh]');
  const homeEtaEl=root.querySelector('[data-location-home-eta]');
  const homeEtaResultEl=root.querySelector('[data-location-home-eta-result]');
  const mapsKey=String(root.getAttribute('data-google-maps-key')||'').trim();
  const mapsMapId=String(root.getAttribute('data-google-maps-map-id')||'').trim();
  const csrf=String(root.getAttribute('data-location-csrf')||'').trim();
  let loading=false;
  let hasRendered=false;
  let mapsPromise=null;
  let map=null;
  let markers=[];

  const stateText={
    FRESH:'最新',
    AGING:'少し前',
    STALE:'古い位置',
    NO_LOCATION:'位置情報なし',
    SHARING_OFF:'共有OFF',
  };
  const homePresenceText={
    HOME:'🏠 自宅内',
    AWAY:'外出中',
    UNKNOWN:'自宅判定保留',
    NO_HOME:'',
  };

  const ageText=(minutes)=>{
    if(!Number.isFinite(minutes))return '';
    if(minutes<=0)return 'たった今';
    if(minutes<60)return `${minutes}分前`;
    const hours=Math.floor(minutes/60);
    return `${hours}時間以上前`;
  };

  const lastUpdatedText=(recordedAt)=>{
    if(typeof recordedAt!=='string'||!recordedAt)return '';
    const date=new Date(recordedAt);
    if(!Number.isFinite(date.getTime()))return '';
    const formatted=new Intl.DateTimeFormat('ja-JP',{
      month:'numeric',
      day:'numeric',
      hour:'2-digit',
      minute:'2-digit',
    }).format(date);
    return `最終更新 ${formatted}`;
  };

  const distanceText=(meters)=>{
    if(!Number.isFinite(meters)||meters<0)return '';
    if(meters<1000)return `約${Math.round(meters)}m`;
    const kilometers=meters/1000;
    return `約${kilometers<10?kilometers.toFixed(1):Math.round(kilometers)}km`;
  };

  const durationText=(seconds)=>{
    if(!Number.isFinite(seconds)||seconds<0)return '';
    const minutes=Math.max(1,Math.round(seconds/60));
    if(minutes<60)return `約${minutes}分`;
    const hours=Math.floor(minutes/60),rest=minutes%60;
    return rest?`約${hours}時間${rest}分`:`約${hours}時間`;
  };

  const validPoint=(latest)=>{
    const lat=Number(latest?.latitude),lng=Number(latest?.longitude);
    return Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180?{lat,lng}:null;
  };

  const googleMapsUrl=(latest)=>{
    const point=validPoint(latest);
    if(!point)return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
  };

  const markerInitial=(name)=>Array.from(String(name||'家族').trim())[0]||'家';

  const makeFamilyMarkerContent=(member)=>{
    const name=String(member?.name||'家族').trim()||'家族';
    const wrap=document.createElement('div');
    wrap.className='location-family-map-marker';
    wrap.dataset.state=String(member?.state||'NO_LOCATION');
    wrap.dataset.viewer=member?.isViewer?'true':'false';
    wrap.style.display='grid';
    wrap.style.justifyItems='center';
    wrap.style.gap='3px';
    wrap.style.opacity=member?.state==='STALE'?'0.72':'1';
    wrap.style.fontFamily='-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    wrap.style.pointerEvents='none';

    const bubble=document.createElement('div');
    bubble.className='location-family-map-marker-bubble';
    bubble.textContent=markerInitial(name);
    bubble.style.width='44px';
    bubble.style.height='44px';
    bubble.style.borderRadius='50%';
    bubble.style.display='grid';
    bubble.style.placeItems='center';
    bubble.style.background=member?.isViewer?'#0f766e':'#4f46e5';
    bubble.style.color='#fff';
    bubble.style.border='3px solid #fff';
    bubble.style.boxShadow=member?.isViewer?'0 0 0 3px rgba(15,118,110,.28),0 4px 12px rgba(15,23,42,.28)':'0 4px 12px rgba(15,23,42,.28)';
    bubble.style.fontSize='18px';
    bubble.style.fontWeight='800';
    bubble.style.lineHeight='1';

    const label=document.createElement('div');
    label.className='location-family-map-marker-label';
    label.textContent=name;
    label.style.maxWidth='112px';
    label.style.overflow='hidden';
    label.style.textOverflow='ellipsis';
    label.style.whiteSpace='nowrap';
    label.style.padding='3px 8px';
    label.style.borderRadius='999px';
    label.style.background='rgba(255,255,255,.96)';
    label.style.border='1px solid rgba(226,232,240,.96)';
    label.style.boxShadow='0 2px 8px rgba(15,23,42,.18)';
    label.style.color='#1e293b';
    label.style.fontSize='11px';
    label.style.fontWeight='700';
    wrap.append(bubble,label);
    return wrap;
  };

  const setStatus=(text)=>{
    if(statusEl)statusEl.textContent=text;
  };

  const setRefreshBusy=(busy)=>{
    if(!refreshEl)return;
    refreshEl.disabled=busy;
    refreshEl.setAttribute('aria-busy',busy?'true':'false');
  };

  const etaRequest=async(body)=>{
    const response=await fetch('/api/location/eta',{
      method:'POST',
      headers:{accept:'application/json','content-type':'application/json','x-csrf-token':csrf},
      credentials:'same-origin',
      cache:'no-store',
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error(typeof payload?.error==='string'?payload.error:'経路時間を取得できませんでした。');
    return payload;
  };

  const renderEtaResult=(payload)=>{
    const duration=durationText(Number(payload?.durationSeconds));
    const distance=distanceText(Number(payload?.distanceMeters));
    return [duration,distance].filter(Boolean).join(' ・ ')||'経路時間を取得できませんでした。';
  };

  const requestEta=async(member,button,result)=>{
    const targetMemberId=Number(member?.memberId);
    if(!Number.isSafeInteger(targetMemberId)||targetMemberId<=0||!csrf)return;
    button.disabled=true;
    result.textContent='経路時間を確認しています…';
    try{result.textContent=renderEtaResult(await etaRequest({targetMemberId}));}
    catch(error){result.textContent=error instanceof Error&&error.message?error.message:'経路時間を取得できませんでした。';}
    finally{button.disabled=false;}
  };

  const requestHomeEta=async()=>{
    if(!homeEtaEl||!homeEtaResultEl||!csrf)return;
    homeEtaEl.disabled=true;
    homeEtaResultEl.textContent='家までの時間を確認しています…';
    try{homeEtaResultEl.textContent=renderEtaResult(await etaRequest({destinationKind:'HOME'}));}
    catch(error){homeEtaResultEl.textContent=error instanceof Error&&error.message?error.message:'家までの時間を取得できませんでした。';}
    finally{homeEtaEl.disabled=false;}
  };

  const makeMemberRow=(member)=>{
    const row=document.createElement('article');
    row.className='location-member-row';
    row.dataset.state=String(member.state||'NO_LOCATION');

    const avatar=document.createElement('div');
    avatar.className='location-avatar-fallback';
    const name=String(member.name||'家族');
    avatar.textContent=name.trim().charAt(0)||'👤';
    avatar.setAttribute('aria-hidden','true');

    const main=document.createElement('div');
    main.className='location-member-main';
    const title=document.createElement('strong');
    title.className='location-member-name';
    title.textContent=name;
    const meta=document.createElement('div');
    meta.className='meta location-member-meta';

    const pieces=[];
    pieces.push(stateText[member.state]||'状態不明');
    const presence=homePresenceText[String(member.homePresence||'')]||'';
    if(presence)pieces.push(presence);
    const age=ageText(Number(member.ageMinutes));
    if(age&&member.state!=='SHARING_OFF'&&member.state!=='NO_LOCATION')pieces.push(age);
    const lastUpdated=lastUpdatedText(member.latest?.recordedAt);
    if(lastUpdated&&member.state!=='SHARING_OFF'&&member.state!=='NO_LOCATION')pieces.push(lastUpdated);
    const distance=member.distanceMetersFromViewer==null?'':distanceText(Number(member.distanceMetersFromViewer));
    if(distance)pieces.push(`直線 ${distance}`);
    const accuracy=Number(member.latest?.accuracyMeters);
    if(Number.isFinite(accuracy)&&accuracy>=0)pieces.push(`精度 ±${Math.round(accuracy)}m`);
    meta.textContent=pieces.join(' ・ ');
    main.append(title,meta);

    const actions=document.createElement('div');
    actions.className='location-member-actions';
    const mapUrl=member.sharingEnabled?googleMapsUrl(member.latest):null;
    if(mapUrl){
      const mapLink=document.createElement('a');
      mapLink.className='location-member-map-link';
      mapLink.href=mapUrl;
      mapLink.target='_blank';
      mapLink.rel='noopener noreferrer';
      mapLink.textContent='Google Mapsで開く';
      actions.append(mapLink);
    }
    const canRoute=!member.isViewer&&(member.state==='FRESH'||member.state==='AGING')&&Number.isSafeInteger(Number(member.memberId))&&csrf;
    if(canRoute){
      const etaButton=document.createElement('button');
      etaButton.type='button';
      etaButton.className='btn gray small';
      etaButton.textContent='車で何分？';
      const etaResult=document.createElement('span');
      etaResult.className='location-eta-result';
      etaResult.setAttribute('aria-live','polite');
      etaButton.addEventListener('click',()=>void requestEta(member,etaButton,etaResult));
      actions.append(etaButton,etaResult);
    }
    if(actions.childNodes.length)main.append(actions);

    const badge=document.createElement('span');
    badge.className='location-state-badge';
    badge.textContent=stateText[member.state]||'不明';

    row.append(avatar,main,badge);
    return row;
  };

  const loadGoogleMaps=()=>{
    if(window.google?.maps)return Promise.resolve(window.google.maps);
    if(mapsPromise)return mapsPromise;
    if(!mapsKey)return Promise.reject(new Error('MAPS_NOT_CONFIGURED'));
    mapsPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const callbackName='__familyTodoLocationMapsReady';
      let settled=false;
      const fail=()=>{
        if(settled)return;
        settled=true;
        reject(new Error('MAPS_LOAD_FAILED'));
      };
      window[callbackName]=()=>{
        if(settled)return;
        settled=true;
        if(window.google?.maps)resolve(window.google.maps);
        else reject(new Error('MAPS_LOAD_FAILED'));
      };
      const params=new URLSearchParams({key:mapsKey,loading:'async',callback:callbackName});
      if(mapsMapId)params.set('libraries','marker');
      script.src=`https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async=true;
      script.defer=true;
      script.addEventListener('error',fail,{once:true});
      document.head.appendChild(script);
    });
    return mapsPromise;
  };

  const clearMarkers=()=>{
    for(const marker of markers){
      if('map'in marker)marker.map=null;
      if(typeof marker.setMap==='function')marker.setMap(null);
    }
    markers=[];
  };

  const renderMap=async(located)=>{
    if(!mapEl||!mapStateEl)return;
    if(!located.length){
      mapEl.hidden=true;
      mapStateEl.hidden=false;
      mapStateEl.textContent='共有中の最新位置がまだありません。地図は位置送信後に表示対象になります。';
      clearMarkers();
      return;
    }
    if(!mapsKey){
      mapEl.hidden=true;
      mapStateEl.hidden=false;
      mapStateEl.textContent=`共有中 ${located.length}人の最終位置を受信しています。位置の古さとは別に、Google Maps表示には管理側のブラウザ用Mapsキー設定が必要です。`;
      clearMarkers();
      return;
    }
    try{
      const maps=await loadGoogleMaps();
      const points=located.map(member=>({member,point:validPoint(member.latest)})).filter(item=>item.point);
      if(!points.length)return;
      mapStateEl.hidden=true;
      mapEl.hidden=false;
      map=map||new maps.Map(mapEl,{center:points[0].point,zoom:14,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,fullscreenControlOptions:{position:maps.ControlPosition.RIGHT_CENTER},...(mapsMapId?{mapId:mapsMapId}:{})});
      clearMarkers();
      const bounds=new maps.LatLngBounds();
      for(const {member,point} of points){
        bounds.extend(point);
        const title=String(member.name||'家族');
        if(mapsMapId&&maps.marker?.AdvancedMarkerElement){
          markers.push(new maps.marker.AdvancedMarkerElement({map,position:point,title,content:makeFamilyMarkerContent(member)}));
        }else{
          markers.push(new maps.Marker({map,position:point,title,label:{text:markerInitial(title),color:'#fff',fontWeight:'700'}}));
        }
      }
      if(points.length===1){map.setCenter(points[0].point);map.setZoom(15);}else{map.fitBounds(bounds,{top:156,right:56,bottom:96,left:56});}
    }catch(_error){
      mapEl.hidden=true;
      mapStateEl.hidden=false;
      mapStateEl.textContent='Google Mapsを読み込めませんでした。家族の位置一覧と「Google Mapsで開く」は引き続き利用できます。';
      clearMarkers();
    }
  };

  const render=(payload)=>{
    const members=Array.isArray(payload?.members)?payload.members:[];
    if(listEl){
      listEl.replaceChildren();
      if(members.length===0){
        const empty=document.createElement('div');
        empty.className='location-empty';
        empty.textContent='表示できる家族メンバーがいません。';
        listEl.append(empty);
      }else{
        members.forEach((member)=>listEl.append(makeMemberRow(member||{})));
      }
    }

    const located=members.filter((member)=>member?.latest&&member?.sharingEnabled&&validPoint(member.latest));
    void renderMap(located);
    hasRendered=true;
    const atHome=members.filter((member)=>member?.homePresence==='HOME').length;
    const presenceUnknown=members.filter((member)=>member?.homePresence==='UNKNOWN').length;
    const presenceSummary=payload?.homeConfigured
      ?` ・ 自宅内 ${atHome}人${presenceUnknown?` ・ 判定保留 ${presenceUnknown}人`:''}`
      :'';
    setStatus(`家族 ${members.length}人 ・ 位置あり ${located.length}人${presenceSummary}`);
  };

  const load=async()=>{
    if(loading)return;
    loading=true;
    setRefreshBusy(true);
    setStatus(hasRendered?'最新位置を更新しています…':'最新位置を確認しています…');
    try{
      const response=await fetch('/api/location/latest',{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('location latest unavailable');
      const payload=await response.json();
      if(!payload?.ok)throw new Error('location latest rejected');
      render(payload);
    }catch(_error){
      if(hasRendered){
        setStatus('最新位置を更新できませんでした ・ 表示は前回取得分です');
      }else{
        setStatus('最新位置を取得できませんでした');
        if(mapStateEl)mapStateEl.textContent='地図を表示できない場合も、位置情報の共有設定や端末側の送信状態は変更されません。';
        if(mapEl)mapEl.hidden=true;
        if(listEl){
          listEl.replaceChildren();
          const error=document.createElement('div');
          error.className='location-empty';
          error.textContent='家族の位置一覧を読み込めませんでした。通信状態を確認して更新してください。';
          listEl.append(error);
        }
      }
    }finally{
      loading=false;
      setRefreshBusy(false);
    }
  };

  if(refreshEl)refreshEl.addEventListener('click',()=>void load());
  if(homeEtaEl)homeEtaEl.addEventListener('click',()=>void requestHomeEta());
  void load();
})();
