(()=>{
'use strict';
if(location.pathname!=='/app/family_log.php')return;

const normalize=value=>String(value||'').replace(/\s+/g,'').trim();
const diaperLabels=new Set(['おしっこ','うんち','両方']);

const dedupe=()=>{
  document.querySelectorAll('.family-log-row[data-id]').forEach(row=>{
    const titleDetail=row.querySelector('.family-log-title-detail');
    const inlineValue=row.querySelector('.family-log-main > .family-log-inline-value');
    if(!(titleDetail instanceof HTMLElement)||!(inlineValue instanceof HTMLElement))return;
    const detail=normalize(titleDetail.textContent);
    const value=normalize(inlineValue.textContent);
    if(!diaperLabels.has(detail))return;
    if(value===detail||diaperLabels.has(value))inlineValue.remove();
  });
};

dedupe();
let queued=false;
new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{queued=false;dedupe();});
}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
