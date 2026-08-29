(()=>{
  'use strict';

  function installWave128Fix1(){
    const style=document.createElement('style');
    style.dataset.wave128Fix1='1';
    style.textContent=`
      .family-log-quick-grid,.family-quick-chore-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      .family-log-quick,.family-quick-chore-record{display:grid!important;grid-template-columns:18px minmax(0,1fr))!important;align-items:center!important;justify-items:center!important;column-gap:3px!important;min-width:0!important}
      .family-log-quick strong,.family-quick-chore-record strong{grid-column:2!important;width:100%!important;min-width:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;display:block!important;-webkit-line-clamp:unset!important;line-clamp:unset!important;word-break:normal!important;overflow-wrap:normal!important;line-height:1.2!important;text-align:center!important;max-width:100%!important}
      .family-log-quick span,.family-quick-chore-record span{grid-column:1!important;flex:0 0 auto!important;min-width:18px!important;text-align:center!important}
      .message-actions .convert-shopping{color:#fff!important}
      .message-actions .convert-shopping *{color:inherit!important}
      .calendar-item.event-single:not([style*="background"]){background:#16a34a!important;color:#fff!important}
      .calendar-projection-safety,.calendar-projection-status,.calendar-backfill-limit{margin:10px 0;padding:10px 12px;border:1px solid #c7d2fe;border-radius:12px;background:#eef2ff;color:#312e81;font-size:12px;line-height:1.5}
      .calendar-projection-safety strong,.calendar-projection-status strong,.calendar-backfill-limit strong{display:block;margin-bottom:3px}
      .calendar-projection-status.is-warning,.calendar-backfill-limit{border-color:#fbbf24;background:#fffbeb;color:#78350f}
      .calendar-projection-status.is-error{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
      .bottom-nav .nav-inner>a{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important;text-align:center!important}
      @media(max-width:340px){.family-log-quick-grid,.family-quick-chore-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media(max-width:600px){
        .bottom-nav .nav-inner>a[href="/app/tasks.php"]{font-size:8px!important;letter-spacing:-.06em!important}
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

    const calendarCard=document.querySelector('.calendar-card');
    if(calendarCard){
      let interactiveTouch=null;
      calendarCard.addEventListener('touchstart',event=>{
        const touch=event.changedTouches&&event.changedTouches[0];
        const link=event.target?.closest?.('.calendar-grid a[href]');
        if(!touch||!link){interactiveTouch=null;return;}
        interactiveTouch={link,x:touch.clientX,y:touch.clientY};
      },{capture:true,passive:true});
      calendarCard.addEventListener('touchend',event=>{
        if(!interactiveTouch)return;
        const touch=event.changedTouches&&event.changedTouches[0];
        const link=event.target?.closest?.('.calendar-grid a[href]');
        const start=interactiveTouch;interactiveTouch=null;
        if(!touch||!link||link!==start.link)return;
        const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
        if(Math.abs(dx)>=28||Math.abs(dy)>=28)return;
        event.preventDefault();event.stopImmediatePropagation();
        location.href=link.href;
      },{capture:true,passive:false});
      calendarCard.addEventListener('touchcancel',()=>{interactiveTouch=null;},{capture:true,passive:true});
    }

    if(location.pathname==='/app/settings_integrations.php'){
      const historyButton=document.getElementById('calendarHistoryBackfill');
      const calendarCardEl=historyButton?.closest('.card');
      if(historyButton&&!document.querySelector('.calendar-projection-safety')){
        const note=document.createElement('div');
        note.className='calendar-projection-safety';
        note.innerHTML='<strong>Google Calendarを整理するときの安全手順</strong>現在Family TODOと連携中の「Family TODO」カレンダーは削除しないでください。先に「全履歴の予定をGoogleへ同期」でFamily TODO由来の予定を確認し、その後、旧ICSを直接取り込んだ別サブカレンダーだけを削除してください。';
        historyButton.parentElement?.insertBefore(note,historyButton);
      }
      if(calendarCardEl&&!document.querySelector('.calendar-projection-status')){
        const detailText=Array.from(calendarCardEl.querySelectorAll('details')).map(el=>el.textContent||'').join(' ');
        const pending=Number((detailText.match(/PENDING件数:\s*(\d+)/)||[])[1]||0);
        const errors=Number((detailText.match(/ERROR件数:\s*(\d+)/)||[])[1]||0);
        const status=document.createElement('div');status.className='calendar-projection-status';
        if(errors>0){status.classList.add('is-error');status.innerHTML=`<strong>Google Calendar同期: 要確認</strong>ERRORが ${errors}件あります。カレンダー削除や再連携は行わず、先に「再試行」で解消してください。`;}
        else if(pending>0){status.classList.add('is-warning');status.innerHTML=`<strong>Google Calendar同期: 処理待ち</strong>PENDINGが ${pending}件あります。同期完了後にGoogle Calendar側を確認してください。`;}
        else{status.innerHTML='<strong>Google Calendar同期キュー: 正常</strong>PENDING / ERROR は0件です。なお「linked件数」にはTASKとEVENTの両方が含まれるため、「対象EVENT件数」との単純一致だけではprojection完全性を判定しません。';}
        const safety=document.querySelector('.calendar-projection-safety');(safety||historyButton).insertAdjacentElement('afterend',status);
      }
      const result=document.getElementById('calendarResult');
      if(result){
        const updateLimitWarning=()=>{
          const count=Number((result.textContent||'').match(/同期対象\s+(\d+)件/)?.[1]||0);
          let warning=document.querySelector('.calendar-backfill-limit');
          if(count>=1000){
            if(!warning){warning=document.createElement('div');warning.className='calendar-backfill-limit';result.insertAdjacentElement('afterend',warning);}
            warning.innerHTML='<strong>全履歴同期の件数上限を確認してください</strong>同期対象が1000件に達しています。現在のbackfillは1回1000件上限のため、1000件を超える履歴がある場合は全件を一度に保証できません。旧ICSカレンダーを削除する前に追加対応が必要です。';
          }else warning?.remove();
        };
        new MutationObserver(updateLimitWarning).observe(result,{childList:true,characterData:true,subtree:true});
        updateLimitWarning();
      }
    }
  }

  installWave128Fix1();
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('[Family TODO] service worker registration failed',err)),{once:true});
  }
})();
