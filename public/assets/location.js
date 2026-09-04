(()=>{
  'use strict';

  const root=document.querySelector('[data-location-live]');
  if(!root)return;

  const statusEl=root.querySelector('[data-location-status]');
  const listEl=root.querySelector('[data-location-list]');
  const mapStateEl=root.querySelector('[data-location-map-state]');

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

  const setStatus=(text)=>{
    if(statusEl)statusEl.textContent=text;
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
    const accuracy=Number(member.latest?.accuracyMeters);
    if(Number.isFinite(accuracy)&&accuracy>=0)pieces.push(`精度 ±${Math.round(accuracy)}m`);
    meta.textContent=pieces.join(' ・ ');
    main.append(title,meta);

    const badge=document.createElement('span');
    badge.className='location-state-badge';
    badge.textContent=stateText[member.state]||'不明';

    row.append(avatar,main,badge);
    return row;
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

    const located=members.filter((member)=>member?.latest&&member?.sharingEnabled);
    if(mapStateEl){
      mapStateEl.textContent=located.length>0
        ? `共有中 ${located.length}人の位置を受信しています。地図プロバイダー設定後、この領域に家族マーカーを表示します。`
        : '共有中の最新位置がまだありません。地図は位置送信後に表示対象になります。';
    }
    setStatus(`家族 ${members.length}人 ・ 位置あり ${located.length}人`);
  };

  const load=async()=>{
    setStatus('最新位置を確認しています…');
    try{
      const response=await fetch('/api/location/latest',{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('location latest unavailable');
      const payload=await response.json();
      if(!payload?.ok)throw new Error('location latest rejected');
      render(payload);
    }catch(_error){
      setStatus('最新位置を取得できませんでした');
      if(mapStateEl)mapStateEl.textContent='地図を表示できない場合も、位置情報の共有設定や端末側の送信状態は変更されません。';
      if(listEl){
        listEl.replaceChildren();
        const error=document.createElement('div');
        error.className='location-empty';
        error.textContent='家族の位置一覧を読み込めませんでした。通信状態を確認して再読み込みしてください。';
        listEl.append(error);
      }
    }
  };

  void load();
})();
