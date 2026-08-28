(()=>{
  'use strict';
  const root=document.documentElement,payloadEl=document.getElementById('liffAuthPayload');
  const status=document.getElementById('status'),error=document.getElementById('error'),retry=document.getElementById('retry');
  const parsePayload=()=>{try{return payloadEl?JSON.parse(payloadEl.textContent||'{}'):{};}catch{return {};}};
  const payload=parsePayload();
  const setError=message=>{if(status)status.textContent='認証に失敗しました。';if(error){error.textContent=String(message||'認証に失敗しました。');error.style.display='block';}if(retry)retry.style.display='inline-flex';};
  const runtime=()=>{const url=new URL(location.href);return {next:url.searchParams.get('next')||String(payload.next||'/app/index.php'),flow:url.searchParams.get('flow')||'',resume:url.searchParams.get('resume')||''};};
  const liffRedirect=value=>location.origin+(value.startsWith('/liff')?value:'/liff');
  async function run(){
    try{
      if(retry)retry.style.display='none';if(error)error.style.display='none';if(status)status.textContent='LINEを初期化しています…';
      if(!window.liff)throw new Error('LIFF SDKを読み込めませんでした。通信状態を確認してください。');
      const liffId=String(payload.liffId||'');if(!liffId)throw new Error('LIFF IDが設定されていません。');
      await window.liff.init({liffId});
      // LIFF secondary redirect can replace location during init. Never reuse a pre-init URL.
      const current=runtime(),googleHome=current.flow==='google_home'&&Boolean(current.resume);
      const loginPath=googleHome?`/liff?flow=google_home&resume=${encodeURIComponent(current.resume)}`:`/liff?next=${encodeURIComponent(current.next)}`;
      if(!window.liff.isLoggedIn()){if(status)status.textContent='LINEログインを開始します…';window.liff.login({redirectUri:liffRedirect(loginPath)});return;}
      if(status)status.textContent='認証情報を確認しています…';const idToken=window.liff.getIDToken();
      if(!idToken)throw new Error('LINE IDトークンを取得できませんでした。LIFFのopenid権限を確認してください。');
      const postNext=googleHome?`/oauth/google/continue?resume=${encodeURIComponent(current.resume)}`:current.next;
      const response=await fetch('/app/api/liff_login.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({id_token:idToken,next:postNext,google_home:googleHome})});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`LINEログインに失敗しました（HTTP ${response.status}）。`);
      if(googleHome){
        const healthResponse=await fetch('/__cf/auth-health',{credentials:'same-origin',headers:{Accept:'application/json'}}),health=await healthResponse.json().catch(()=>null);
        if(!healthResponse.ok||!health?.member_exists||!health?.member_id_present||!health?.family_id_present)throw new Error('LINE認証は完了しましたが、Family TODOのセッションを確認できませんでした。');
      }
      const target=String(data.redirect||'/app/index.php');if(status)status.textContent='ログインしました。アプリを開いています…';root.dataset.liffAuthJs='ready';location.replace(target.startsWith('/')?target:'/app/index.php');
    }catch(e){root.dataset.liffAuthJs='error';setError(e&&e.message?e.message:String(e));}
  }
  if(retry)retry.addEventListener('click',run);root.dataset.liffAuthJs='loaded';run();
})();
