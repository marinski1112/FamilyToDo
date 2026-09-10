(()=>{
  'use strict';
  const summary=document.querySelector('[data-location-history-summary]');
  if(!summary)return;
  const rewrite=()=>{
    const text=String(summary.textContent||'');
    if(text.startsWith('24時間を超えた詳細GPSは削除し、')){
      summary.textContent=text.replace('24時間を超えた詳細GPSは削除し、','詳細GPSとは別に、');
    }
  };
  rewrite();
  new MutationObserver(rewrite).observe(summary,{childList:true,characterData:true,subtree:true});
})();
