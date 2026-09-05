(()=>{
'use strict';
const payload=JSON.parse(document.getElementById('settingsLocationPayload')?.textContent||'{}');
const csrf=String(payload.csrf||'');
const list=document.getElementById('locationDeviceList');
const provision=document.getElementById('provisionOwnTracks');
const memberSelect=document.getElementById('locationMember');
const secretCard=document.getElementById('ownTracksSecret');
const endpoint=`${location.origin}/api/location/owntracks`;

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const formatTime=value=>{
  if(!value)return '未受信';
  const date=new Date(String(value).replace(' ','T')+(String(value).includes('Z')||/[+-]\d\d:\d\d$/.test(String(value))?'':'Z'));
  return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short'}).format(date);
};

async function api(body){
  const response=await fetch('/api/location/devices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,csrf})});
  const data=await response.json().catch(()=>({ok:false,error:'応答を読み取れませんでした。'}));
  if(!response.ok||!data.ok)throw new Error(data.error||'処理に失敗しました。');
  return data;
}

async function copyText(value){
  try{
    await navigator.clipboard.writeText(value);
  }catch{
    const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();
  }
}

function renderDevices(devices){
  if(!Array.isArray(devices)||devices.length===0){list.innerHTML='<div class="location-empty">OwnTracks端末はまだ登録されていません。</div>';return;}
  list.innerHTML=devices.map(device=>{
    const revoked=Boolean(device.revokedAt)||!device.enabled;
    const sharing=Boolean(device.sharingEnabled)&&!revoked;
    const status=revoked?'失効済み':sharing?'共有ON':'共有OFF';
    const statusClass=revoked?'revoked':sharing?'on':'';
    return `<div class="device-card" data-device-id="${Number(device.id)}"><div class="device-head"><div class="device-title"><strong>${esc(device.memberName||'メンバー')} ・ OwnTracks</strong><div class="meta">Username: ${esc(device.publicId)}</div><div class="meta">最終受信: ${esc(formatTime(device.lastSeenAt))}</div></div><span class="device-status ${statusClass}">${status}</span></div>${revoked?'':`<div class="device-actions"><button type="button" class="btn ${sharing?'gray':''} small device-share" data-id="${Number(device.id)}" data-enabled="${sharing?'0':'1'}">位置共有を${sharing?'OFF':'ON'}</button><button type="button" class="btn danger small device-revoke" data-id="${Number(device.id)}">端末を失効</button></div>`}</div>`;
  }).join('');
  list.querySelectorAll('.device-share').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await api({action:'sharing',device_id:Number(button.dataset.id),enabled:button.dataset.enabled==='1'});await loadDevices();}
    catch(error){alert(error instanceof Error?error.message:'共有設定を変更できませんでした。');button.disabled=false;}
  }));
  list.querySelectorAll('.device-revoke').forEach(button=>button.addEventListener('click',async()=>{
    if(!confirm('この端末を失効しますか？ 同じPasswordでは再接続できなくなります。'))return;
    button.disabled=true;
    try{await api({action:'revoke',device_id:Number(button.dataset.id)});await loadDevices();}
    catch(error){alert(error instanceof Error?error.message:'端末を失効できませんでした。');button.disabled=false;}
  }));
}

async function loadDevices(){
  list.innerHTML='<div class="location-empty">端末を確認しています…</div>';
  try{
    const response=await fetch('/api/location/devices',{headers:{accept:'application/json'},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'端末一覧を取得できませんでした。');
    renderDevices(data.devices);
  }catch(error){list.innerHTML=`<div class="location-empty">${esc(error instanceof Error?error.message:'端末一覧を取得できませんでした。')}</div>`;}
}

provision?.addEventListener('click',async()=>{
  const memberId=Number(memberSelect?.value||0);
  if(!memberId)return;
  if(!confirm('OwnTracks用の接続情報を発行しますか？ Passwordは一度だけ表示されます。'))return;
  provision.disabled=true;
  try{
    const data=await api({action:'provision',provider:'OWNTRACKS',member_id:memberId});
    document.getElementById('ownTracksUrl').textContent=endpoint;
    document.getElementById('ownTracksUsername').textContent=String(data.device.publicId||'');
    document.getElementById('ownTracksPassword').textContent=String(data.device.secret||'');
    secretCard.hidden=false;
    secretCard.scrollIntoView({behavior:'smooth',block:'start'});
    await loadDevices();
  }catch(error){alert(error instanceof Error?error.message:'端末を発行できませんでした。');}
  finally{provision.disabled=false;}
});

document.querySelectorAll('.credential-copy').forEach(button=>button.addEventListener('click',async()=>{
  const target=document.getElementById(String(button.dataset.copy||''));
  if(!target)return;
  await copyText(target.textContent||'');
  const before=button.textContent;button.textContent='コピー済み';setTimeout(()=>button.textContent=before,1200);
}));

document.getElementById('reloadLocationDevices')?.addEventListener('click',loadDevices);
loadDevices();
})();
