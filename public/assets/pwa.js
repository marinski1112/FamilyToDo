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
      .calendar-item.event-single:not([style*="background"]){background:#16a34a!important;color:#fff!important}
      .calendar-projection-safety,.calendar-projection-status,.calendar-backfill-limit,.calendar-rebind-diagnostic{margin:10px 0;padding:10px 12px;border:1px solid #c7d2fe;border-radius:12px;background:#eef2ff;color:#312e81;font-size:12px;line-height:1.5}
      .calendar-projection-safety strong,.calendar-projection-status strong,.calendar-backfill-limit strong,.calendar-rebind-diagnostic strong{display:block;margin-bottom:3px}
      .calendar-projection-status.is-warning,.calendar-backfill-limit,.calendar-rebind-diagnostic.is-warning{border-color:#fbbf24;background:#fffbeb;color:#78350f}
      .calendar-projection-status.is-error,.calendar-rebind-diagnostic.is-error{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
      .calendar-rebind-actions{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}
      .bottom-nav .nav-inner>a{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important;text-align:center!important}
      .family-log-management-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;width:100%!important;min-width:0!important}
      .family-log-management-head>:last-child{position:static!important;inset:auto!important;transform:none!important;margin:0!important;justify-self:end!important;align-self:center!important;max-width:100%!important}
      .wave128-auto-contrast{color:#fff!important}.wave128-auto-contrast *{color:inherit!important}
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

    const parseRgb=value=>{
      const match=String(value||'').match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
      if(!match)return null;
      return {r:Number(match[1]),g:Number(match[2]),b:Number(match[3]),a:match[4]===undefined?1:Number(match[4])};
    };
    const luminance=rgb=>{
      const channel=value=>{const x=Math.max(0,Math.min(255,value))/255;return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
      return 0.2126*channel(rgb.r)+0.7152*channel(rgb.g)+0.0722*channel(rgb.b);
    };
    const contrastRatio=(a,b)=>{const hi=Math.max(a,b),lo=Math.min(a,b);return (hi+0.05)/(lo+0.05);};
    const applyInteractiveContrast=root=>{
      const elements=[];
      if(root?.matches?.('button,.btn'))elements.push(root);
      root?.querySelectorAll?.('button,.btn').forEach(el=>elements.push(el));
      elements.forEach(el=>{
        if(el.disabled||el.getAttribute('aria-disabled')==='true'||el.classList.contains('gray')||el.classList.contains('secondary')||el.classList.contains('danger'))return;
        const computed=getComputedStyle(el),bg=parseRgb(computed.backgroundColor),fg=parseRgb(computed.color);
        if(!bg||!fg||bg.a<0.9)return;
        const bgLum=luminance(bg),fgLum=luminance(fg);
        const current=contrastRatio(bgLum,fgLum),white=contrastRatio(bgLum,1);
        if(bgLum<0.35&&current<4.5&&white>current)el.classList.add('wave128-auto-contrast');
      });
    };
    applyInteractiveContrast(document);
    let contrastFrame=0;
    const contrastObserver=new MutationObserver(records=>{
      if(contrastFrame)return;
      contrastFrame=requestAnimationFrame(()=>{
        contrastFrame=0;
        records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)applyInteractiveContrast(node);}));
      });
    });
    contrastObserver.observe(document.body,{childList:true,subtree:true});

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
    const familyCsrf=String(familyData.csrf||'');
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
          const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify({csrf:familyCsrf,action:'execute_quick_action',quick_action_id:Number(button.dataset.quickActionId||0)})});
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
      const detailText=calendarCardEl?Array.from(calendarCardEl.querySelectorAll('details')).map(el=>el.textContent||'').join(' '):'';
      const eventTargets=Number((detailText.match(/対象EVENT件数:\s*(\d+)/)||[])[1]||0);
      const linkedTotal=Number((detailText.match(/linked件数:\s*(\d+)/)||[])[1]||0);
      if(calendarCardEl&&!document.querySelector('.calendar-projection-status')){
        const pending=Number((detailText.match(/PENDING件数:\s*(\d+)/)||[])[1]||0);
        const errors=Number((detailText.match(/ERROR件数:\s*(\d+)/)||[])[1]||0);
        const status=document.createElement('div');status.className='calendar-projection-status';
        if(errors>0){status.classList.add('is-error');status.innerHTML=`<strong>Google Calendar同期: 要確認</strong>ERRORが ${errors}件あります。まず「同期先を診断」でGoogle側サブカレンダーの状態を確認してください。`;}
        else if(pending>0){status.classList.add('is-warning');status.innerHTML=`<strong>Google Calendar同期: 処理待ち</strong>PENDINGが ${pending}件あります。同期完了後にGoogle Calendar側を確認してください。`;}
        else{status.innerHTML=`<strong>Google Calendar同期キュー: 正常</strong>PENDING / ERROR は0件です。全履歴FAMILY EVENTは ${eventTargets}件、active link総数は ${linkedTotal}件です。linked件数にはTASKとEVENTの両方が含まれるため、単純一致だけではprojection完全性を判定しません。`;}
        const safety=document.querySelector('.calendar-projection-safety');(safety||historyButton).insertAdjacentElement('afterend',status);
      }
      if(historyButton&&calendarCardEl&&!document.getElementById('calendarProjectionDiagnose')){
        const actions=document.createElement('div');actions.className='calendar-rebind-actions';
        const diagnose=document.createElement('button');diagnose.type='button';diagnose.className='btn gray';diagnose.id='calendarProjectionDiagnose';diagnose.textContent='同期先を診断';
        const rebuild=document.createElement('button');rebuild.type='button';rebuild.className='btn danger';rebuild.id='calendarProjectionRebind';rebuild.textContent='新しい同期用カレンダーを作成';rebuild.hidden=true;
        const diagnostic=document.createElement('div');diagnostic.className='calendar-rebind-diagnostic';diagnostic.id='calendarProjectionDiagnostic';diagnostic.hidden=true;
        actions.append(diagnose,rebuild);historyButton.parentElement?.insertBefore(actions,historyButton);actions.insertAdjacentElement('afterend',diagnostic);
        const integrationCsrf=typeof csrf==='string'?csrf:'';
        const requestProjection=async body=>{const response=await fetch('/api/google-calendar/backfill',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({csrf:integrationCsrf,...body})});const data=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);return data;};
        const renderDiagnostic=data=>{
          diagnostic.hidden=false;diagnostic.className='calendar-rebind-diagnostic';rebuild.hidden=true;
          const reasons=(data.error_samples||[]).map(item=>`${item.operation||'SYNC'}: ${item.reason||'ERROR'} (retry ${item.retry_count||0})`).join(' / ');
          if(data.calendar_status==='OK'&&Number(data.stale_link_count||0)===0){diagnostic.innerHTML=`<strong>同期先サブカレンダー: 正常</strong>Google側の同期用カレンダーへ到達できます。ERROR ${data.error_count||0}件${reasons?' / '+reasons:''}`;return;}
          diagnostic.classList.add('is-error');
          if(data.calendar_status==='MISSING_CALENDAR'){diagnostic.innerHTML=`<strong>同期先サブカレンダーが見つかりません</strong>現在保存されている同期先はGoogle側に存在しません。これは現在のERROR原因と整合します。古いevent IDを新しいカレンダーへ流用せず、projectionを安全に再bindできます。${reasons?' 失敗: '+reasons:''}`;rebuild.hidden=false;return;}
          if(Number(data.stale_link_count||0)>0){diagnostic.innerHTML=`<strong>同期先と既存linkが不一致です</strong>${data.stale_link_count}件のactive linkが現在のサブカレンダーと一致しません。安全な再bindが必要です。${reasons?' 失敗: '+reasons:''}`;rebuild.hidden=false;return;}
          diagnostic.classList.add('is-warning');diagnostic.innerHTML=`<strong>同期先診断: ${data.calendar_status||'要確認'}</strong>${reasons||'Google Calendarの認証または権限を確認してください。'}`;
        };
        diagnose.addEventListener('click',async()=>{diagnose.disabled=true;diagnostic.hidden=false;diagnostic.textContent='診断中…';try{renderDiagnostic(await requestProjection({action:'diagnose_projection'}));}catch(error){diagnostic.className='calendar-rebind-diagnostic is-error';diagnostic.textContent=error instanceof Error?error.message:String(error);}finally{diagnose.disabled=false;}});
        rebuild.addEventListener('click',async()=>{if(!confirm('新しい「Family TODO」同期用サブカレンダーを作成し、古いprojection link / outboxを新しい同期先用に切り替えます。Family TODO本体のタスク・予定は削除しません。続行しますか？'))return;rebuild.disabled=true;try{const data=await requestProjection({action:'rebind_projection',confirm:'CREATE_NEW_CALENDAR'});diagnostic.className='calendar-rebind-diagnostic';diagnostic.hidden=false;diagnostic.innerHTML=`<strong>新しい同期先を作成しました</strong>旧link ${data.detached_links||0}件をdetachし、旧outbox ${data.cleared_outbox||0}件をクリアしました。次に「全履歴の予定をGoogleへ同期」を実行し、その後「既存の予定を同期」で現在のTASKも投影してください。`;rebuild.hidden=true;}catch(error){diagnostic.className='calendar-rebind-diagnostic is-error';diagnostic.hidden=false;diagnostic.textContent=error instanceof Error?error.message:String(error);}finally{rebuild.disabled=false;}});
      }
      const result=document.getElementById('calendarResult');
      const updateLimitWarning=()=>{
        let warning=document.querySelector('.calendar-backfill-limit');
        if(eventTargets>1000){
          if(!warning){warning=document.createElement('div');warning.className='calendar-backfill-limit';(result||historyButton).insertAdjacentElement('afterend',warning);}
          const overflow=eventTargets-1000;
          warning.innerHTML=`<strong>全履歴同期は1回では完了しません</strong>Family TODOの対象EVENTは ${eventTargets}件です。現在の全履歴backfillは1回1000件上限のため、少なくとも ${overflow}件は1回の実行対象外になります。旧ICSカレンダーを削除する前に、全件同期できるページング対応が必要です。`;
          return;
        }
        const previewCount=Number((result?.textContent||'').match(/同期対象\s+(\d+)件/)?.[1]||0);
        if(eventTargets===0&&previewCount>=1000){
          if(!warning){warning=document.createElement('div');warning.className='calendar-backfill-limit';(result||historyButton).insertAdjacentElement('afterend',warning);}
          warning.innerHTML='<strong>全履歴同期の件数上限を確認してください</strong>同期previewが1000件に達しています。server側の総件数を確認できない場合は、旧ICSカレンダーを削除する前に全件同期を保証できるページング対応が必要です。';
        }else warning?.remove();
      };
      if(result)new MutationObserver(updateLimitWarning).observe(result,{childList:true,characterData:true,subtree:true});
      updateLimitWarning();
    }
  }

  installWave128Fix1();
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('[Family TODO] service worker registration failed',err)),{once:true});
  }
})();
