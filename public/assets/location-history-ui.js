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
  const reportEl=document.createElement('section');reportEl.setAttribute('aria-live','polite');root.append(reportEl);
  const reportButton=document.createElement('button');reportButton.type='button';reportButton.className='btn gray small';reportButton.textContent='文字レポート';loadEl?.insertAdjacentElement('afterend',reportButton);
  let membersLoaded=false;
  let latestMembers=null;
  let loadingHistory=false;
  let historyRequest=0,displayedMemberId=0;
  const liveRoot=root.closest('[data-location-live]');
  const csrf=String(liveRoot?.dataset.locationCsrf||'');
  const addressCache=new Map();
  const MAX_ADDRESS_LOOKUPS=20;
  let geocoder=null;
  let geocoderClassPromise=null;
  const emitHistory=(memberId=0,points=[])=>liveRoot?.dispatchEvent(new CustomEvent('family-location-history',{detail:{memberId,points}}));
  const clearDisplay=()=>{reportEl.replaceChildren();historyRequest++;displayedMemberId=0;emitHistory();if(summaryEl)summaryEl.textContent='';linksEl?.replaceChildren();};
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
  const selectedDate=()=>{
    const value=String(fromEl?.value||''),date=dateMs(value),today=dateMs(todayJst());
    if(!Number.isFinite(date)||date>today)throw new Error('確認する日付を選んでください。');
    return value;
  };
  if(fromEl){fromEl.max=todayJst();fromEl.value=todayJst();const label=fromEl.closest('label');if(label?.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.nodeValue='日付';}
  if(toEl){toEl.closest('label')?.setAttribute('hidden','');toEl.value=fromEl?.value||todayJst();}
  root.querySelector('.location-history-presets')?.setAttribute('hidden','');
  [fromEl,memberEl].forEach(input=>input?.addEventListener('change',()=>{clearDisplay();setStatus('条件を変更しました。「地図に表示」を押してください。');}));

  const loadMembers=async()=>{
    if(membersLoaded)return;
    let payload={ok:true,members:latestMembers};
    if(!latestMembers){
      const response=await fetch('/api/location/latest',{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
      payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error('家族一覧を取得できませんでした。');
      latestMembers=Array.isArray(payload.members)?payload.members:[];
      liveRoot?.dispatchEvent(new CustomEvent('family-location-members',{detail:{members:latestMembers}}));
    }
    const selected=memberEl.value;
    const members=(Array.isArray(payload.members)?payload.members:[]).filter(member=>member?.sharingEnabled&&Number.isSafeInteger(Number(member?.memberId))&&Number(member.memberId)>0);
    memberEl.replaceChildren();
    if(!members.length){
      const option=document.createElement('option');option.value='';option.textContent='共有中の家族がいません';memberEl.append(option);memberEl.disabled=true;
      throw new Error('位置履歴を参照できる共有中メンバーがいません。');
    }
    for(const member of members){
      const option=document.createElement('option');option.value=String(member.memberId);option.textContent=String(member.name||'家族');memberEl.append(option);
      if(selected?String(member.memberId)===selected:member.isViewer)option.selected=true;
    }
    memberEl.disabled=false;membersLoaded=true;
  };

  const searchWrap=document.createElement('section');searchWrap.className='location-history-search';
  const searchTitle=document.createElement('h3');searchTitle.textContent='🔎 いつ行った？';
  const searchNote=document.createElement('p');searchNote.className='small';searchNote.textContent='長期保存した滞在先を、拠点名や住所から検索します。';
  const searchRow=document.createElement('div');searchRow.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px';
  const searchInput=document.createElement('input');searchInput.type='search';searchInput.maxLength=40;searchInput.placeholder='例：職場、目黒区';searchInput.setAttribute('aria-label','滞在先を検索');
  const searchButton=document.createElement('button');searchButton.type='button';searchButton.className='btn gray small';searchButton.textContent='検索';
  const searchResults=document.createElement('div');searchResults.setAttribute('aria-live','polite');
  searchRow.append(searchInput,searchButton);searchWrap.append(searchTitle,searchNote,searchRow,searchResults);root.insertBefore(searchWrap,reportEl);

  const runSearch=async()=>{
    const q=searchInput.value.trim();searchResults.replaceChildren();
    if(!q){const p=document.createElement('p');p.className='small';p.textContent='検索語を入力してください。';searchResults.append(p);return;}
    searchButton.disabled=true;
    try{
      await loadMembers();
      const memberId=Number(memberEl.value);if(!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('家族を選択してください。');
      const params=new URLSearchParams({memberId:String(memberId),q});
      const response=await fetch(`/api/location/history-search?${params}`,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'検索できませんでした。');
      const results=Array.isArray(payload.results)?payload.results:[];
      if(!results.length){const p=document.createElement('p');p.className='small';p.textContent='長期保存済みの滞在には見つかりませんでした。';searchResults.append(p);return;}
      for(const result of results){
        const button=document.createElement('button');button.type='button';button.className='btn gray small';button.style.cssText='display:block;width:100%;margin:6px 0;text-align:left';
        button.textContent=`${result.date} · ${result.label} · ${result.minutes}分`;
        button.addEventListener('click',()=>{if(fromEl)fromEl.value=String(result.date||'');clearDisplay();void loadHistory('report');});
        searchResults.append(button);
      }
    }catch(error){const p=document.createElement('p');p.className='small';p.textContent=error instanceof Error?error.message:'検索できませんでした。';searchResults.append(p);}finally{searchButton.disabled=false;}
  };
  searchButton.addEventListener('click',()=>void runSearch());searchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void runSearch();}});

  const renderLinks=(points,truncated)=>{
    if(!linksEl)return;
    linksEl.replaceChildren();
    if(!points.length)return;
    const firstUrl=mapsLink(points[0]),lastUrl=mapsLink(points[points.length-1]);
    const firstLabel=truncated?'取得範囲の開始地点をGoogle Mapsで開く':'開始地点をGoogle Mapsで開く';
    const lastLabel=truncated?'取得範囲の終了地点をGoogle Mapsで開く':'終了地点をGoogle Mapsで開く';
    for(const [label,url] of [[firstLabel,firstUrl],[lastLabel,lastUrl]]){
      if(!url)continue;
      const link=document.createElement('a');link.className='btn gray small';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;linksEl.append(link);
    }
  };

  const reportRowText=(entry,address='')=>{
    const place=address?(entry.place==='未登録地点付近'?address:`${entry.place}（${address}）`):entry.place;
    return `${formatTime(entry.from)}〜${formatTime(entry.to)} · ${place} · ${entry.minutes}分滞在`;
  };
  const coarseJapaneseAddress=(result)=>{
    const formatted=String(result?.formatted_address||'').replace(/^日本[、,]?\s*/,'').replace(/^〒?\s*\d{3}-?\d{4}\s*/,'').trim();
    if(!formatted)return '';
    const chome=formatted.match(/^(.+?\d+\s*丁目)/);
    if(chome)return chome[1].replace(/\s+/g,'');
    const components=Array.isArray(result?.address_components)?result.address_components:[];
    const byType=(type)=>String(components.find(component=>Array.isArray(component?.types)&&component.types.includes(type))?.long_name||'').trim();
    const coarse=[byType('administrative_area_level_1'),byType('locality'),byType('sublocality_level_1'),byType('sublocality_level_2'),byType('sublocality_level_3'),byType('sublocality_level_4')]
      .filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join('');
    if(coarse)return coarse;
    return formatted.replace(/(?:\s|　)*(?:\d+[-‐ー−]\d+(?:[-‐ー−]\d+)?|\d+番地?.*)$/,'').trim();
  };
  const newAddressDiagnostic=()=>({maps:window.google?.maps?'READY':'UNAVAILABLE',library:'NOT_ATTEMPTED',attempted:0,succeeded:0,failed:0,cacheHits:0,noAnchor:0,lastFailure:'NONE'});
  const safeGeocodeFailure=(error)=>{
    const text=`${typeof error?.code==='string'?error.code:''} ${typeof error?.message==='string'?error.message:''}`.toUpperCase();
    for(const code of ['REQUEST_DENIED','ZERO_RESULTS','OVER_QUERY_LIMIT','INVALID_REQUEST','UNKNOWN_ERROR'])if(text.includes(code))return code;
    return 'GEOCODE_FAILED';
  };
  const loadGeocoderClass=async(diag)=>{
    if(geocoderClassPromise)return geocoderClassPromise;
    geocoderClassPromise=(async()=>{
      const Maps=window.google?.maps;diag.maps=Maps?'READY':'UNAVAILABLE';
      if(!Maps){diag.library='MAPS_UNAVAILABLE';return null;}
      if(typeof Maps.importLibrary==='function'){
        try{const library=await Maps.importLibrary('geocoding');if(typeof library?.Geocoder==='function'){diag.library='READY_IMPORT_LIBRARY';return library.Geocoder;}diag.library='GEOCODING_LIBRARY_UNAVAILABLE';}
        catch(error){diag.library=safeGeocodeFailure(error)==='GEOCODE_FAILED'?'GEOCODING_LIBRARY_IMPORT_FAILED':safeGeocodeFailure(error);}
      }
      if(typeof Maps.Geocoder==='function'){diag.library='READY_LEGACY';return Maps.Geocoder;}
      if(diag.library==='NOT_ATTEMPTED')diag.library='GEOCODING_LIBRARY_UNAVAILABLE';return null;
    })();
    const result=await geocoderClassPromise;if(!result)geocoderClassPromise=null;return result;
  };
  const reverseAddress=async(point,diag)=>{
    const lat=Number(point?.latitude),lng=Number(point?.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){diag.failed+=1;diag.lastFailure='INVALID_POINT';return '';}
    const key=`${lat.toFixed(4)},${lng.toFixed(4)}`;
    if(addressCache.has(key)){diag.cacheHits+=1;const cached=addressCache.get(key)||'';if(cached)diag.succeeded+=1;else{diag.failed+=1;diag.lastFailure='CACHED_EMPTY';}return cached;}
    try{
      const Geocoder=await loadGeocoderClass(diag);if(!Geocoder){diag.failed+=1;diag.lastFailure=diag.library||'GEOCODING_LIBRARY_UNAVAILABLE';return '';}
      geocoder=geocoder||new Geocoder();diag.attempted+=1;
      const response=await geocoder.geocode({location:{lat,lng},language:'ja',region:'JP'});const result=response?.results?.[0];
      if(!result){diag.failed+=1;diag.lastFailure='ZERO_RESULTS';return '';}
      const coarse=coarseJapaneseAddress(result);if(!coarse){diag.failed+=1;diag.lastFailure='EMPTY_ADDRESS';return '';}
      addressCache.set(key,coarse);diag.succeeded+=1;return coarse;
    }catch(error){diag.failed+=1;diag.lastFailure=safeGeocodeFailure(error);return '';}
  };
  const appendAddressDiagnostic=(diag)=>{
    const row=document.createElement('p');row.className='small';row.dataset.locationAddressDiagnostic='1';
    row.textContent=`住所診断: Maps=${diag.maps} / Geocoder=${diag.library} / API試行=${diag.attempted} / 成功=${diag.succeeded} / 失敗=${diag.failed} / キャッシュ=${diag.cacheHits} / anchorなし=${diag.noAnchor} / 最終=${diag.lastFailure}`;reportEl.append(row);
  };
  const persistArchivedAddress=async(entry,address)=>{
    const archiveStayId=Number(entry?.archiveStayId);if(!Number.isSafeInteger(archiveStayId)||archiveStayId<=0||!csrf||entry?.place!=='未登録地点付近')return;
    try{await fetch('/api/location/stay-address',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'same-origin',cache:'no-store',body:JSON.stringify({archiveStayId,addressLabel:address}),signal:AbortSignal.timeout(5000)});}catch{}
  };
  const enrichStayAddresses=async(rows,points,requestId)=>{
    const byTime=new Map(points.map(point=>[String(point?.recordedAt||''),point]));const diag=newAddressDiagnostic();let lookups=0;
    for(const {entry,row} of rows){
      if(requestId!==historyRequest||lookups>=MAX_ADDRESS_LOOKUPS)break;
      if(entry.address)continue;
      const point=entry.anchor||byTime.get(String(entry.from||''));if(!point){diag.noAnchor+=1;diag.lastFailure='NO_ANCHOR_POINT';continue;}
      lookups+=1;const address=await reverseAddress(point,diag);if(requestId!==historyRequest)return;
      if(address){row.textContent=reportRowText(entry,address);void persistArchivedAddress(entry,address);}
    }
    if(requestId===historyRequest&&lookups)appendAddressDiagnostic(diag);
  };

  const loadHistory=async(mode='map')=>{
    if(!loadEl||!memberEl||loadingHistory)return;
    loadingHistory=true;const requestId=++historyRequest;loadEl.disabled=true;reportButton.disabled=true;reportEl.replaceChildren();emitHistory();
    if(summaryEl)summaryEl.textContent='';if(linksEl)linksEl.replaceChildren();let selectorLocked=false;
    try{
      setStatus('選択した日の移動を確認しています…');await loadMembers();if(requestId!==historyRequest)return;
      const memberId=Number(memberEl.value),memberName=String(memberEl.selectedOptions?.[0]?.textContent||'家族');
      if(!Number.isSafeInteger(memberId)||memberId<=0)throw new Error('家族を選択してください。');
      memberEl.disabled=true;selectorLocked=true;const date=selectedDate();
      const params=new URLSearchParams({memberId:String(memberId),date});
      const response=await fetch(`/api/location/history?${params}`,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>null);if(requestId!==historyRequest)return;
      if(!response.ok||!payload?.ok)throw new Error(typeof payload?.error==='string'?payload.error:'選択した日の移動を取得できませんでした。');
      if(latestMembers&&!latestMembers.some(member=>Number(member.memberId)===memberId&&member.sharingEnabled))throw new Error('位置共有が停止されました。');
      if(Number(memberEl.value)!==memberId)throw new Error('選択した家族が変更されたため、もう一度確認してください。');
      const points=Array.isArray(payload.points)?payload.points:[],report=Array.isArray(payload.report)?payload.report:[],archived=payload.archived===true;
      if(!points.length&&!report.length){setStatus(`${memberName}・${date}の位置履歴はありません。`);return;}
      const limit=Number(payload.limit),truncated=!archived&&Number.isSafeInteger(limit)&&limit>0&&points.length>=limit;
      let meters=0;for(let i=1;i<points.length;i+=1){if(Date.parse(points[i].recordedAt)-Date.parse(points[i-1].recordedAt)<=3600000)meters+=distanceMeters(points[i-1],points[i]);}
      const start=formatTime(points[0]?.recordedAt),end=formatTime(points[points.length-1]?.recordedAt);
      const countText=archived?`${Number(payload.rawPointCount)||0}件から長期保存用${points.length}点に簡略化`:truncated?`${points.length}件以上（最新${points.length}件のみ表示）`:`${points.length}件`;
      setStatus(`${memberName}・${date}の記録 ${countText}${start&&end?` ・ ${start}〜${end}`:''}`);
      if(summaryEl){summaryEl.textContent=archived?`24時間を超えた詳細GPSは削除し、滞在記録と簡略化した移動経路を長期保存しています。簡略経路の点間直線距離 ${distanceText(meters)}。`:truncated?`取得できた最新${points.length}件の記録点間の直線距離合計 ${distanceText(meters)}。上限に達しています。`:`記録点間の直線距離合計 ${distanceText(meters)}。1時間を超える記録の空白は線で結びません。道路経路や実際の移動距離とは異なります。`;}
      const heading=document.createElement('h3');heading.textContent='滞在レポート';reportEl.append(heading);
      const note=document.createElement('p');note.className='small';note.textContent='「どこに・何分いたか」をまとめます。未登録地点は文字レポートでGoogle Mapsから丁目程度まで住所確認し、長期履歴の検索にも利用します。番地・建物名は保存しません。';reportEl.append(note);
      const reportRows=[];
      for(const entry of report){if(entry?.kind!=='STAY')continue;const row=document.createElement('p');row.className='small';row.textContent=reportRowText(entry,String(entry.address||''));reportEl.append(row);reportRows.push({entry,row});}
      if(!reportRows.length){const empty=document.createElement('p');empty.textContent=payload.reportAvailable===false?'レポートを取得できませんでした。地図の履歴は表示できます。':'この日にまとめて表示できる滞在はありません。';reportEl.append(empty);}
      if(payload.reportTruncated){const more=document.createElement('p');more.textContent='滞在100件まで表示しています。';reportEl.append(more);}
      if(mode==='report'&&reportRows.length)void enrichStayAddresses(reportRows,points,requestId);
      renderLinks(points,truncated);displayedMemberId=memberId;emitHistory(memberId,points);
      const sheet=liveRoot?.querySelector('[data-location-family-sheet]');if(sheet&&mode==='map'){sheet.open=false;sheet.querySelector('summary')?.focus({preventScroll:true});}
    }catch(error){if(requestId===historyRequest)setStatus(error instanceof Error&&error.message?error.message:'選択した日の移動を取得できませんでした。');}
    finally{loadingHistory=false;if(selectorLocked)memberEl.disabled=false;if(latestMembers&&!membersLoaded)void loadMembers().catch(()=>{});loadEl.disabled=false;reportButton.disabled=false;}
  };

  reportButton.addEventListener('click',()=>void loadHistory('report'));if(loadEl)loadEl.addEventListener('click',()=>void loadHistory());
})();