(()=>{
  'use strict';
  const root=document.documentElement,payloadEl=document.getElementById('liffAuthPayload');
  const status=document.getElementById('status'),error=document.getElementById('error'),retry=document.getElementById('retry');
  const aliases={tasks:'/app/tasks.php',calendar:'/app/calendar.php',shopping:'/app/shopping.php','family-log':'/app/family_log.php',messages:'/app/messages.php',settings:'/app/settings.php'};
  const parsePayload=()=>{try{return payloadEl?JSON.parse(payloadEl.textContent||'{}'):{};}catch{return {};}};const payload=parsePayload();
  const valid=value=>{const path=String(value||'');return path.length>0&&path.length<=2048&&/^\/(?!\/)[^\r\n\\]*$/.test(path)&&!path.startsWith('/oauth/')?path:null;};
  const resolve=()=>{const url=new URL(location.href),alias=url.pathname.match(/^\/liff\/([^/]+)\/?$/)?.[1];if(alias&&aliases[alias])return aliases[alias];const explicit=valid(url.searchParams.get('next'));if(explicit)return explicit;const state=url.searchParams.get('liff.state');if(state&&state.length<=2048){const stateAlias=state.match(/^\/([^/?#]+)\/?$/)?.[1];if(stateAlias&&aliases[stateAlias])return aliases[stateAlias];if(state.startsWith('?')){const next=valid(new URLSearchParams(state.slice(1)).get('next'));if(next)return next;}}return valid(payload.next);};
  const setError=message=>{if(status)status.textContent='認証に失敗しました。';if(error){error.textContent=String(message||'認証に失敗しました。');error.style.display='block';}if(retry)retry.style.display='inline-flex';};
  const liffRedirect=value=>location.origin+(value.startsWith('/liff')?value:'/liff');
  async function run(){try{
    if(retry)retry.style.display='none';if(error)error.style.display='none';if(status)status.textContent='LINEを初期化しています…';
    if(!window.liff)throw new Error('LIFF SDKを読み込めませんでした。通信状態を確認してください。');const liffId=String(payload.liffId||'');if(!liffId)throw new Error('LIFF IDが設定されていません。');
    await window.liff.init({liffId});console.info(JSON.stringify({stage:'LIFF_PRIMARY_RECEIVED',has_liff_state:new URL(location.href).searchParams.has('liff.state')}));const current=resolve();console.info(JSON.stringify({stage:'LIFF_TARGET_RESOLVED',target_kind:Object.entries(aliases).find(([,v])=>v===current)?.[0]?.replace('-','_')||(current==='/app/index.php'?'home':'other')}));if(!current)throw new Error('リンク先を安全に確認できませんでした。');const loginPath=`/liff?next=${encodeURIComponent(current)}`;
    if(!window.liff.isLoggedIn()){if(status)status.textContent='LINEログインを開始します…';window.liff.login({redirectUri:liffRedirect(loginPath)});return;}
    if(status)status.textContent='認証情報を確認しています…';const idToken=window.liff.getIDToken();if(!idToken)throw new Error('LINE IDトークンを取得できませんでした。LIFFのopenid権限を確認してください。');
    console.info(JSON.stringify({stage:'LIFF_LOGIN_POST'}));const response=await fetch('/app/api/liff_login.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({id_token:idToken,next:current})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`LINEログインに失敗しました（HTTP ${response.status}）。`);
    console.info(JSON.stringify({stage:'LIFF_SESSION_COMMITTED'}));const target=valid(data.redirect);if(!target)throw new Error('ログイン後のリンク先を安全に確認できませんでした。');if(status)status.textContent='セッションを確認しています…';
    const health=await fetch('/__cf/auth-health',{credentials:'same-origin',headers:{Accept:'application/json'}});const session=await health.json().catch(()=>null);if(!health.ok||!session?.member_exists)throw new Error('LINEログインは完了しましたがセッションを確認できません。');
    console.info(JSON.stringify({stage:'LIFF_SESSION_CONFIRMED',member_present:true}));if(status)status.textContent='ログインしました。アプリを開いています…';console.info(JSON.stringify({stage:'LIFF_REDIRECT',member_present:true}));root.dataset.liffAuthJs='ready';location.replace(target);
  }catch(e){root.dataset.liffAuthJs='error';setError(e&&e.message?e.message:String(e));}}
  if(retry)retry.addEventListener('click',run);root.dataset.liffAuthJs='loaded';run();
})();
