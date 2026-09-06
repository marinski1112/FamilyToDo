(()=>{
  'use strict';

  const root=document.querySelector('[data-location-live]');
  if(!root)return;

  const statusEl=root.querySelector('[data-location-status]');
  const listEl=root.querySelector('[data-location-list]');
  const mapEl=root.querySelector('[data-location-map]');
  const mapStateEl=root.querySelector('[data-location-map-state]');
  const refreshEl=root.querySelector('[data-location-refresh]');
  const mapsKey=String(root.getAttribute('data-google-maps-key')||'').trim();
  const mapsMapId=String(root.getAttribute('data-google-maps-map-id')||'').trim();
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
    if(meters<1000)return `直線 約${Math.round(meters)}m`;
    const kilometers=meters/1000;
    return `直線 約${kilometers<10?kilometers.toFixed(1):Math.round(kilometers)}km`;
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

  const setStatus=(text)=>{
    if(statusEl)statusEl.textContent=text;
  };

  const setRefreshBusy=(busy)=>{
    if(!refreshEl)return;
    refreshEl.disabled=busy;
    refreshEl.setAttribute('aria-busy',busy?'true':'false');
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
    const age=ageText(Number(member.ageMinutes));
    if(age&&member.state!=='SHARING_OFF'&&member.state!=='NO_LOCATION')pieces.push(age);
    const lastUpdated=lastUpdatedText(member.latest?.recordedAt);
    if(lastUpdated&&member.state!=='SHARING_OFF'&&member.state!=='NO_LOCATION')pieces.push(lastUpdated);
    const distance=member.distanceMetersFromViewer==null?'':distanceText(Number(member.distanceMetersFromViewer));
    if(distance)pieces.push(distance);
    const accuracy=Number(member.latest?.accuracyMeters);
    if(Number.isFinite(accuracy)&&accuracy>=0)pieces.push(`精度 ±${Math.round(accuracy)}m`);
    meta.textContent=pieces.join(' ・ ');
    main.append(title,meta);

    const mapUrl=member.sharingEnabled?googleMapsUrl(member.latest):null;
    if(mapUrl){
      const mapLink=document.createElement('a');
      mapLink.className='location-member-map-link';
      mapLink.href=mapUrl;
      mapLink.target='_blank';
      mapLink.rel='noopener noreferrer';
      mapLink.textContent='Google Mapsで開く';
      main.append(mapLink);
    }

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
      const params=new URLSearchParams({key:mapsKey,loading:'async'});
      if(mapsMapId)params.set('libraries','marker');
      script.src=`https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async=true;
      script.defer=true;
      script.addEventListener('load',()=>window.google?.maps?resolve(window.google.maps):reject(new Error('MAPS_LOAD_FAILED')),{once:true});
      script.addEventListener('error',()=>reject(new Error('MAPS_LOAD_FAILED')),{once:true});
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
      mapStateEl.textContent=`共有中 ${located.length}人の位置を受信しています。Google Maps表示には管理側のブラウザ用Mapsキー設定が必要です。`;
      clearMarkers();
      return;
    }
    try{
      const maps=await loadGoogleMaps();
      const points=located.map(member=>({member,point:validPoint(member.latest)})).filter(item=>item.point);
      if(!points.length)return;
      mapStateEl.hidden=true;
      mapEl.hidden=false;
      map=map||new maps.Map(mapEl,{center:points[0].point,zoom:14,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,...(mapsMapId?{mapId:mapsMapId}:{})});
      clearMarkers();
      const bounds=new maps.LatLngBounds();
      for(const {member,point} of points){
        bounds.extend(point);
        const title=String(member.name||'家族');
        if(mapsMapId&&maps.marker?.AdvancedMarkerElement){
          markers.push(new maps.marker.AdvancedMarkerElement({map,position:point,title}));
        }else{
          markers.push(new maps.Marker({map,position:point,title}));
        }
      }
      if(points.length===1){map.setCenter(points[0].point);map.setZoom(15);}else{map.fitBounds(bounds,48);}
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
    setStatus(`家族 ${members.length}人 ・ 位置あり ${located.length}人`);
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
  void load();
})();
