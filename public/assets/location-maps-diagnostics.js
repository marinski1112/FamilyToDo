(()=>{
  'use strict';

  const root=document.querySelector('[data-location-live]');
  if(!root)return;

  const mapEl=root.querySelector('[data-location-map]');
  const mapStateEl=root.querySelector('[data-location-map-state]');
  if(!mapStateEl)return;

  const messages={
    AUTH:'Google Mapsの認証に失敗しました。Maps JavaScript API用キーのAPI制限・ウェブサイト制限・請求設定を確認してください。家族の位置一覧と「Google Mapsで開く」は引き続き利用できます。',
    SCRIPT:'Google Mapsのスクリプトを取得できませんでした。通信状態またはLINE内ブラウザのコンテンツ制限を確認してください。家族の位置一覧と「Google Mapsで開く」は引き続き利用できます。',
    INIT:'Google Mapsの初期化に失敗しました。APIキーはページまで届いています。Map ID設定またはブラウザ互換性を確認してください。家族の位置一覧と「Google Mapsで開く」は引き続き利用できます。',
  };
  let failure='';
  let showingFailure=false;

  const showFailure=()=>{
    const message=messages[failure];
    if(!message)return;
    showingFailure=true;
    if(mapEl&&!mapEl.hidden)mapEl.hidden=true;
    if(mapStateEl.hidden)mapStateEl.hidden=false;
    if(mapStateEl.textContent!==message)mapStateEl.textContent=message;
    queueMicrotask(()=>{showingFailure=false;});
  };

  const previousAuthFailure=window.gm_authFailure;
  window.gm_authFailure=()=>{
    failure='AUTH';
    if(typeof previousAuthFailure==='function'){
      try{previousAuthFailure();}catch(_error){}
    }
    queueMicrotask(showFailure);
    setTimeout(showFailure,100);
    setTimeout(showFailure,1000);
  };

  window.addEventListener('error',(event)=>{
    const target=event.target;
    if(target instanceof HTMLScriptElement&&target.src.startsWith('https://maps.googleapis.com/maps/api/js?')){
      failure='SCRIPT';
      setTimeout(showFailure,0);
    }
  },true);

  const observer=new MutationObserver(()=>{
    if(showingFailure)return;
    const text=mapStateEl.textContent||'';
    if(text.includes('Google Mapsを読み込めませんでした')){
      failure='INIT';
      showFailure();
      return;
    }
    if(failure&&!Object.values(messages).includes(text))failure='';
  });
  observer.observe(mapStateEl,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
