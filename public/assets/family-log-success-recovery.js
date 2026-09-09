(()=>{
  'use strict';

  let recovering=false;
  const finish=toast=>{
    if(recovering)return;
    recovering=true;
    try{toast?.remove();}catch{}
    try{window.familyLogDiagnostic?.reload();}catch{}
    try{location.reload();}
    catch{location.href=location.href;}
  };

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(!(node instanceof Element))continue;
        const toast=node.matches('.family-log-toast:not(.error)')?node:node.querySelector?.('.family-log-toast:not(.error)');
        if(!toast)continue;
        queueMicrotask(()=>finish(toast));
        return;
      }
    }
  });

  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
