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
  let mapsScripts=0;
  let scriptLoads=0;
  let scriptErrors=0;
  let authFailures=0;
  let mapEverVisible=Boolean(mapEl&&!mapEl.hidden);
  let authAfterVisible=false;
  let googleMapsAtAuth=false;
  let firstKey='';
  let keysDiffer=false;

  const diagnosticText=()=>{
    const visibility=mapEverVisible?'地図表示成功あり':'地図表示成功なし';
    const authTiming=authFailures?(authAfterVisible?'表示後にauth failure':'表示前にauth failure'):'auth failureなし';
    const googleState=authFailures?(googleMapsAtAuth?'auth時 google.mapsあり':'auth時 google.mapsなし'):'auth時状態なし';
    const keyState=mapsScripts>1?(keysDiffer?'複数scriptでキー差異あり':'複数scriptは同一キー'):'Maps script単一';
    return `診断: Maps script ${mapsScripts}回 / load ${scriptLoads}回 / script error ${scriptErrors}回 / ${visibility} / auth ${authFailures}回・${authTiming} / ${googleState} / ${keyState}`;
  };

  const showFailure=()=>{
    const message=messages[failure];
    if(!message)return;
    showingFailure=true;
    if(mapEl&&!mapEl.hidden)mapEl.hidden=true;
    if(mapStateEl.hidden)mapStateEl.hidden=false;
    const text=`${message}\n${diagnosticText()}`;
    if(mapStateEl.textContent!==text)mapStateEl.textContent=text;
    queueMicrotask(()=>{showingFailure=false;});
  };

  const trackMapsScript=(script)=>{
    if(!(script instanceof HTMLScriptElement)||!script.src.startsWith('https://maps.googleapis.com/maps/api/js?'))return;
    mapsScripts+=1;
    try{
      const key=new URL(script.src).searchParams.get('key')||'';
      if(mapsScripts===1)firstKey=key;
      else if(key!==firstKey)keysDiffer=true;
    }catch(_error){}
    script.addEventListener('load',()=>{scriptLoads+=1;if(failure)showFailure();},{once:true});
    script.addEventListener('error',()=>{scriptErrors+=1;failure='SCRIPT';setTimeout(showFailure,0);},{once:true});
  };

  document.querySelectorAll('script[src^="https://maps.googleapis.com/maps/api/js?"]').forEach(trackMapsScript);
  const scriptObserver=new MutationObserver((records)=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node instanceof HTMLScriptElement)trackMapsScript(node);
      }
    }
  });
  scriptObserver.observe(document.head||document.documentElement,{childList:true,subtree:true});

  const previousAuthFailure=window.gm_authFailure;
  window.gm_authFailure=()=>{
    authFailures+=1;
    authAfterVisible=mapEverVisible;
    googleMapsAtAuth=Boolean(window.google?.maps);
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

  if(mapEl){
    const mapObserver=new MutationObserver(()=>{
      if(!mapEl.hidden)mapEverVisible=true;
    });
    mapObserver.observe(mapEl,{attributes:true,attributeFilter:['hidden']});
  }

  const observer=new MutationObserver(()=>{
    if(showingFailure)return;
    const text=mapStateEl.textContent||'';
    if(text.includes('Google Mapsを読み込めませんでした')){
      failure='INIT';
      showFailure();
      return;
    }
    if(failure&&!Object.values(messages).some(message=>text.startsWith(message)))failure='';
  });
  observer.observe(mapStateEl,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
