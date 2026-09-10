(()=>{
  const root=document.getElementById('googleCalendarInboundPreview');
  if(!root)return;
  const loadButton=document.getElementById('googleCalendarInboundLoad');
  const previewButton=document.getElementById('googleCalendarInboundPreviewButton');
  const calendarSelect=document.getElementById('googleCalendarInboundCalendar');
  const fromInput=document.getElementById('googleCalendarInboundFrom');
  const toInput=document.getElementById('googleCalendarInboundTo');
  const status=document.getElementById('googleCalendarInboundResult');
  const rows=document.getElementById('googleCalendarInboundRows');
  if(!(loadButton instanceof HTMLButtonElement)||!(previewButton instanceof HTMLButtonElement)||!(calendarSelect instanceof HTMLSelectElement)||!(fromInput instanceof HTMLInputElement)||!(toInput instanceof HTMLInputElement)||!status||!rows)return;

  const csrfToken=()=>typeof csrf==='string'?csrf:'';
  const classificationLabel={
    NEW_CANDIDATE:'新規候補',ALREADY_IMPORTED:'取り込み済み',ALREADY_LINKED_OUTBOUND:'FamilyToDo同期済み',ICS_ALREADY_IMPORTED:'ICS取り込み済み',AMBIGUOUS_EXISTING_LOCAL:'既存予定と要確認',APP_OWNED_MARKER:'FamilyToDo生成予定',RECURRING_UNSUPPORTED:'定期予定（未対応）',INVALID_EVENT_ID:'無効な予定ID',INVALID:'無効な予定',
  };
  const blockedLabel={APP_OWNED_CALENDAR_BLOCKED:'FamilyToDo同期用',CHILD_JOURNAL_CALENDAR_BLOCKED:'成長日記'};
  const post=async(url,body)=>{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:csrfToken(),...body})});
    const data=await response.json().catch(()=>({ok:false,error:'応答を解析できません。'}));
    if(!response.ok||data.ok===false)throw new Error(String(data.error||`HTTP ${response.status}`));
    return data;
  };
  const setStatus=value=>{status.textContent=String(value||'');};
  const clearRows=()=>{while(rows.firstChild)rows.removeChild(rows.firstChild);};
  const appendLine=(title,detail,classification)=>{
    const item=document.createElement('div');item.className='calendar-inbound-preview-row';
    const head=document.createElement('div');head.className='calendar-inbound-preview-head';
    const strong=document.createElement('strong');strong.textContent=String(title||'（無題）');
    const badge=document.createElement('span');badge.className='small';badge.textContent=classificationLabel[classification]||String(classification||'');
    head.append(strong,badge);item.appendChild(head);
    const meta=document.createElement('div');meta.className='small';meta.textContent=String(detail||'');item.appendChild(meta);
    rows.appendChild(item);
  };

  fromInput.value=String(root.dataset.defaultFrom||fromInput.value||'');
  toInput.value=String(root.dataset.defaultTo||toInput.value||'');

  loadButton.addEventListener('click',async()=>{
    loadButton.disabled=true;previewButton.disabled=true;calendarSelect.disabled=true;clearRows();setStatus('カレンダー一覧を読み込んでいます…');
    try{
      const data=await post('/api/google-calendar/inbound-calendars',{});
      calendarSelect.replaceChildren();
      const initial=document.createElement('option');initial.value='';initial.textContent='取り込み元を選択';calendarSelect.appendChild(initial);
      let selectable=0;
      for(const calendar of Array.isArray(data.calendars)?data.calendars:[]){
        const option=document.createElement('option');option.value=String(calendar.id||'');
        const blocked=String(calendar.blocked_reason||'');option.disabled=Boolean(blocked);
        option.textContent=String(calendar.summary||'（名前なし）')+(blocked?`（${blockedLabel[blocked]||'取り込み不可'}）`:'');
        calendarSelect.appendChild(option);if(!blocked)selectable++;
      }
      calendarSelect.disabled=false;previewButton.disabled=selectable===0;
      setStatus(`読み取り可能なカレンダー ${selectable}件${data.truncated?'（一覧は上限まで表示）':''}。取り込み元を明示的に選択してください。`);
    }catch(error){setStatus(`一覧取得失敗: ${error instanceof Error?error.message:String(error)}`);}
    finally{loadButton.disabled=false;}
  });

  previewButton.addEventListener('click',async()=>{
    const calendarId=calendarSelect.value,fromDate=fromInput.value,toDate=toInput.value;
    if(!calendarId){setStatus('取り込み元カレンダーを選択してください。');return;}
    if(!fromDate||!toDate){setStatus('確認する日付範囲を指定してください。');return;}
    previewButton.disabled=true;clearRows();setStatus('予定を読み取り、重複候補を確認しています…');
    try{
      const data=await post('/api/google-calendar/inbound-preview',{calendar_id:calendarId,from_date:fromDate,to_date:toDate});
      const counts=data.counts||{};
      const order=['NEW_CANDIDATE','ALREADY_IMPORTED','ALREADY_LINKED_OUTBOUND','ICS_ALREADY_IMPORTED','AMBIGUOUS_EXISTING_LOCAL','APP_OWNED_MARKER','RECURRING_UNSUPPORTED','INVALID_EVENT_ID','INVALID'];
      const summary=order.filter(key=>Number(counts[key]||0)>0).map(key=>`${classificationLabel[key]||key} ${Number(counts[key]||0)}件`).join(' / ')||'予定0件';
      setStatus(`${data.range_days}日間をread-onlyで確認: ${summary}${data.truncated?' / Google予定は250件上限で打ち切り':''}${data.local_scan_truncated?' / FamilyToDo側の照合件数が上限のため新規判定を保留':''}`);
      for(const event of Array.isArray(data.events)?data.events:[]){
        const range=event.all_day?(event.end_at?`${String(event.start_date||'')} ～ ${String(event.end_at).slice(0,10)}`:`${String(event.start_date||'')}（終日）`):`${String(event.start_at||'').slice(0,16)}${event.end_at?' ～ '+String(event.end_at).slice(0,16):''}`;
        appendLine(event.title,range,event.classification);
      }
      for(const event of Array.isArray(data.invalid)?data.invalid:[])appendLine(event.title,String(event.invalid_reason||''),'INVALID');
    }catch(error){setStatus(`プレビュー失敗: ${error instanceof Error?error.message:String(error)}`);}
    finally{previewButton.disabled=false;}
  });
})();
