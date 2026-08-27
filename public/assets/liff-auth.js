(()=>{
  'use strict';
  const root=document.documentElement;
  const payloadEl=document.getElementById('liffAuthPayload');
  const status=document.getElementById('status');
  const error=document.getElementById('error');
  const retry=document.getElementById('retry');
  const parsePayload=()=>{try{return payloadEl?JSON.parse(payloadEl.textContent||'{}'):{};}catch{return {};}};
  const payload=parsePayload();
  const setError=(message)=>{
    if(status) status.textContent='認証に失敗しました。';
    if(error){error.textContent=String(message||'認証に失敗しました。');error.style.display='block';}
    if(retry) retry.style.display='inline-flex';
  };
  async function run(){
    try{
      if(retry) retry.style.display='none';
      if(error) error.style.display='none';
      if(status) status.textContent='LINEを初期化しています…';
      if(!window.liff) throw new Error('LIFF SDKを読み込めませんでした。通信状態を確認してください。');
      const liffId=String(payload.liffId||'');
      if(!liffId) throw new Error('LIFF IDが設定されていません。');
      await window.liff.init({liffId});
      if(!window.liff.isLoggedIn()){
        if(status) status.textContent='LINEログインを開始します…';
        window.liff.login({redirectUri:location.href});
        return;
      }
      if(status) status.textContent='認証情報を確認しています…';
      const idToken=window.liff.getIDToken();
      if(!idToken) throw new Error('LINE IDトークンを取得できませんでした。LIFFのopenid権限を確認してください。');
      const response=await fetch('/app/api/liff_login.php',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({id_token:idToken})
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok) throw new Error(data?.error||('LINEログインに失敗しました（HTTP '+response.status+'）。'));
      const target=String(payload.next||data.redirect||'/app/index.php');
      if(status) status.textContent='ログインしました。アプリを開いています…';
      root.dataset.liffAuthJs='ready';
      location.replace(target.startsWith('/')?target:'/app/index.php');
    }catch(e){
      root.dataset.liffAuthJs='error';
      setError(e&&e.message?e.message:String(e));
    }
  }
  if(retry) retry.addEventListener('click',run);
  root.dataset.liffAuthJs='loaded';
  run();
})();
