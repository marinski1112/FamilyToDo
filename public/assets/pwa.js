(()=>{
  'use strict';

  function installWave128Fix1(){
    const style=document.createElement('style');
    style.dataset.wave128Fix1='1';
    style.textContent=`
      .family-log-quick-grid,.family-quick-chore-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      .family-log-quick,.family-quick-chore-record{display:grid!important;grid-template-columns:18px minmax(0,1fr)!important;align-items:center!important;justify-items:center!important;column-gap:3px!important;min-width:0!important}
      .family-log-quick strong,.family-quick-chore-record strong{grid-column:2!important;width:100%!important;min-width:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;display:block!important;-webkit-line-clamp:unset!important;line-clamp:unset!important;word-break:normal!important;overflow-wrap:normal!important;line-height:1.2!important;text-align:center!important;max-width:100%!important}
      .family-log-quick span,.family-quick-chore-record span{grid-column:1!important;flex:0 0 auto!important;min-width:18px!important;text-align:center!important}
      .message-actions .convert-shopping{color:#fff!important}
      .message-actions .convert-shopping *{color:inherit!important}
      @media(max-width:340px){.family-log-quick-grid,.family-quick-chore-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media(max-width:600px){
        .day-modal .modal-top{display:grid!important;grid-template-columns:40px minmax(0,1fr) 40px 40px!important;grid-template-areas:'prev title next close' '. reorder reorder .'!important;gap:8px!important;align-items:center!important;width:100%!important;min-width:0!important}
        .day-modal .modal-top #modalPrev{grid-area:prev}.day-modal .modal-top #modalTitle{grid-area:title;min-width:0!important;text-align:center!important;overflow-wrap:anywhere}.day-modal .modal-top #modalNext{grid-area:next}.day-modal .modal-top #modalClose{grid-area:close}.day-modal .modal-top #modalReorder{grid-area:reorder;justify-self:end!important}
        .day-modal .modal-top button{min-width:40px!important;min-height:40px!important}
        .day-modal{max-width:100%!important;overflow-x:hidden!important}.modal-scroll,.modal-body{min-width:0!important;max-width:100%!important}
      }
    `;
    document.head.append(style);

    document.querySelectorAll('.family-log-quick strong,.family-quick-chore-record strong').forEach(label=>{
      if(label.dataset.wave128Label==='1')return;
      const chars=Array.from(label.textContent||'');
      label.dataset.wave128Label='1';
      if(chars.length>=5&&chars.length<=8){
        label.replaceChildren(document.createTextNode(chars.slice(0,4).join('')),document.createElement('br'),document.createTextNode(chars.slice(4).join('')));
      }
    });

    const familyPayload=document.getElementById('familyLogPayload');
    let familyData={};
    try{familyData=familyPayload?JSON.parse(familyPayload.textContent||'{}'):{};}catch{}
    const csrf=String(familyData.csrf||'');
    document.querySelectorAll('.family-log-quick-action').forEach(original=>{
      if(original.dataset.wave128FlashFix==='1')return;
      const button=original.cloneNode(true);
      button.dataset.wave128FlashFix='1';
      original.replaceWith(button);
      button.addEventListener('click',async event=>{
        event.preventDefault();event.stopPropagation();
        if(button.disabled)return;
        button.disabled=true;button.setAttribute('aria-busy','true');
        try{
          const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify({csrf,action:'execute_quick_action',quick_action_id:Number(button.dataset.quickActionId||0)})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok||result.ok===false)throw new Error(result.error||`HTTP ${response.status}`);
          const toast=document.createElement('div');toast.className='family-log-toast';toast.textContent=`✓ ${result.message||'記録しました'}`;document.body.append(toast);setTimeout(()=>location.reload(),900);
        }catch(error){
          const toast=document.createElement('div');toast.className='family-log-toast error';toast.textContent=error instanceof Error?error.message:String(error);document.body.append(toast);setTimeout(()=>toast.remove(),2000);button.disabled=false;button.removeAttribute('aria-busy');
        }
      });
    });

    const calendarPayload=document.getElementById('calendarPayload');
    if(calendarPayload){
      let data={};try{data=JSON.parse(calendarPayload.textContent||'{}');}catch{}
      const occurrences=[];
      Object.values(data.detail||{}).forEach(rows=>Array.isArray(rows)&&rows.forEach(row=>{if(Number(row?.id)<0&&Number(row?.recurrence_rule_id)>0)occurrences.push(row);}));
      document.querySelectorAll('a.calendar-band[data-task-id]').forEach(link=>{
        const syntheticId=Number(link.dataset.taskId||0);if(syntheticId>=0)return;
        const row=occurrences.find(item=>Number(item.id)===syntheticId);if(!row)return;
        const params=new URLSearchParams({edit:String(row.recurrence_rule_id)});
        if(Number(row.recurrence_occurrence_id)>0)params.set('occurrence',String(row.recurrence_occurrence_id));
        if(/^\d{4}-\d{2}-\d{2}$/.test(String(row.occurrence_date||'')))params.set('date',String(row.occurrence_date));
        link.href=`/app/recurring.php?${params.toString()}`;
      });
    }
  }

  installWave128Fix1();
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('[Family TODO] service worker registration failed',err)),{once:true});
  }
})();
