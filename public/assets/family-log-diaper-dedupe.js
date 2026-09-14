(()=>{
'use strict';
if(location.pathname!=='/app/family_log.php')return;
let payload={};
try{payload=JSON.parse(document.getElementById('familyLogPayload')?.textContent||'{}')}catch{}
const logs=payload.logs&&typeof payload.logs==='object'?payload.logs:{};
const dedupe=()=>{
  document.querySelectorAll('.family-log-row[data-id]').forEach(row=>{
    const log=logs[String(row.dataset.id||'')];
    const type=String(log?.log_type||row.dataset.familyLogType||'').toUpperCase();
    const detail=String(log?.detail_code||'').toUpperCase();
    if(!['DIAPER','TOILET'].includes(type)||!['WET','DIRTY','BOTH'].includes(detail))return;
    const value=row.querySelector('.family-log-main > .family-log-inline-value');
    if(value instanceof HTMLElement)value.remove();
  });
};
dedupe();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;dedupe()})}).observe(document.body,{childList:true,subtree:true});
})();
