(()=>{
'use strict';
  const payload=JSON.parse(document.getElementById('messagesPayload')?.textContent||'{}');
  const csrf=String(payload.csrf||'');
  const sameOriginUrl=value=>{try{const url=new URL(String(value||''),location.origin);return url.origin===location.origin?url.href:null;}catch{return null;}};
  const style=document.createElement('style');
  style.textContent='.message-stamp-picker{margin:10px 0}.message-stamp-options{display:none;gap:8px;flex-wrap:wrap;margin-top:8px}.message-stamp-options.open{display:flex}.message-stamp-option{width:58px;height:58px;border:1px solid #ddd;border-radius:12px;background:#fff;padding:4px;display:grid;place-items:center}.message-stamp-option.selected{outline:3px solid currentColor}.message-stamp-option img{max-width:48px;max-height:48px;object-fit:contain}.message-stamp-selected{font-size:.9rem;margin-top:6px}.message-stamp-attached{display:block;width:min(128px,36vw);height:min(128px,36vw);object-fit:contain;margin:8px 0;cursor:pointer}.message-stamp-viewer{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.68);display:none;align-items:center;justify-content:center;padding:24px}.message-stamp-viewer.open{display:flex}.message-stamp-viewer img{max-width:min(88vw,520px);max-height:82vh;object-fit:contain}.message-stamp-viewer button{position:absolute;top:18px;right:18px}';
  document.head.appendChild(style);

  const attachPicker=form=>{
    if(!(form instanceof HTMLFormElement))return ()=>0;
    const textarea=form.querySelector('textarea[name="text"]');
    let selectedStampId=0,loaded=false;
    const wrap=document.createElement('div');wrap.className='message-stamp-picker';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='btn gray small';toggle.textContent='スタンプを追加';
    const options=document.createElement('div');options.className='message-stamp-options';options.setAttribute('aria-label','スタンプ候補');
    const selected=document.createElement('div');selected.className='message-stamp-selected';
    const clear=document.createElement('button');clear.type='button';clear.className='btn gray small';clear.textContent='スタンプを外す';clear.hidden=true;
    wrap.append(toggle,options,selected,clear);
    if(textarea)textarea.insertAdjacentElement('afterend',wrap);else form.appendChild(wrap);
    const sync=()=>{if(textarea)textarea.required=selectedStampId<=0;clear.hidden=selectedStampId<=0;if(selectedStampId<=0)selected.textContent='';};
    clear.onclick=()=>{selectedStampId=0;options.querySelectorAll('.message-stamp-option').forEach(button=>button.classList.remove('selected'));sync();};
    const load=async()=>{
      if(loaded)return;options.textContent='読み込み中…';
      try{
        const response=await fetch('/api/calendar-stamp-options',{credentials:'same-origin'}),data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok||!Array.isArray(data.options))throw new Error('load failed');
        options.textContent='';
        for(const option of data.options){
          const id=Number(option?.id||0),thumbnail=sameOriginUrl(option?.thumbnailUrl);if(!Number.isSafeInteger(id)||id<=0||!thumbnail)continue;
          const button=document.createElement('button');button.type='button';button.className='message-stamp-option';button.title=String(option?.name||'スタンプ');
          const image=document.createElement('img');image.src=thumbnail;image.alt=button.title;button.appendChild(image);
          button.onclick=()=>{selectedStampId=id;options.querySelectorAll('.message-stamp-option').forEach(entry=>entry.classList.remove('selected'));button.classList.add('selected');selected.textContent=`選択中：${button.title}`;sync();};
          options.appendChild(button);
        }
        if(!options.children.length)options.textContent='利用できるスタンプはありません。';
        loaded=true;
      }catch{loaded=false;options.textContent='スタンプ候補を読み込めませんでした。もう一度押すと再試行します。';}
    };
    toggle.onclick=async()=>{await load();options.classList.toggle('open');};
    sync();return ()=>selectedStampId;
  };

  const msgForm=document.getElementById('msgForm'),selectedInlineStamp=attachPicker(msgForm);
  document.getElementById('msgForm').onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(e.currentTarget));const stampId=selectedInlineStamp();const endpoint=stampId>0?'/api/message-stamps':'/api/messages';if(stampId>0)b.assetId=stampId;const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('投稿できませんでした。');location.reload();}catch(_err){alert('投稿できませんでした。')}};
  const shoppingModal=document.getElementById('messageShoppingModal'),shoppingForm=document.getElementById('messageShoppingForm'),shoppingStatus=document.getElementById('messageShoppingStatus'),shoppingSubmit=document.getElementById('messageShoppingSubmit');
  const closeShoppingModal=()=>{shoppingModal.classList.remove('open');shoppingModal.setAttribute('aria-hidden','true');shoppingStatus.textContent=''};document.getElementById('messageShoppingClose').onclick=closeShoppingModal;shoppingModal.addEventListener('click',e=>{if(e.target===shoppingModal)closeShoppingModal()});
  document.querySelectorAll('.convert-shopping').forEach(btn=>btn.onclick=()=>{shoppingForm.reset();shoppingForm.message_id.value=btn.dataset.id||'';shoppingForm.name.value=(btn.dataset.text||'').slice(0,255);shoppingForm.quantity.value='1';shoppingForm.querySelectorAll('[name=shopping_assignees]').forEach(x=>x.checked=Number(x.value)===Number(btn.dataset.target||0));shoppingModal.classList.add('open');shoppingModal.setAttribute('aria-hidden','false');setTimeout(()=>shoppingForm.name.focus(),60)});
  shoppingForm.onsubmit=async e=>{e.preventDefault();const body={action:'convert_shopping',id:Number(shoppingForm.message_id.value),name:shoppingForm.name.value.trim(),quantity:shoppingForm.quantity.value.trim()||'1',category:shoppingForm.category.value.trim(),due_date:shoppingForm.due_date.value,task_id:Number(shoppingForm.task_id.value||0),assignees:[...shoppingForm.querySelectorAll('[name=shopping_assignees]:checked')].map(x=>Number(x.value)),memo:shoppingForm.memo.value.trim(),url:shoppingForm.url.value.trim(),csrf};if(!body.name){alert('商品名を入力してください。');return;}shoppingSubmit.disabled=true;shoppingStatus.textContent='保存しています…';try{const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('買い物に追加できませんでした。');location.reload();}catch(_err){shoppingStatus.textContent='';alert('買い物に追加できませんでした。')}finally{shoppingSubmit.disabled=false}};
  const taskModal=document.getElementById('messageTaskModal'),taskForm=document.getElementById('messageTaskForm'),taskMode=document.getElementById('messageTaskMode'),existingFields=document.getElementById('existingTaskFields'),newFields=document.getElementById('newTaskFields'),taskStatus=document.getElementById('messageTaskStatus'),taskSubmit=document.getElementById('messageTaskSubmit'),messageTaskAllDay=document.getElementById('messageTaskAllDay'),messageTaskTimeFields=document.getElementById('messageTaskTimeFields'),messageTaskCalendarVisible=document.getElementById('messageTaskCalendarVisible'),messageTaskCalendarColorWrap=document.getElementById('messageTaskCalendarColorWrap');
  const syncMessageTaskOptions=()=>{if(messageTaskTimeFields)messageTaskTimeFields.style.display=messageTaskAllDay.checked?'none':'grid';if(messageTaskCalendarColorWrap)messageTaskCalendarColorWrap.style.display=messageTaskCalendarVisible.checked?'block':'none'};
  const syncTaskMode=()=>{const isNew=taskMode.value==='new';existingFields.style.display=isNew?'none':'block';newFields.style.display=isNew?'block':'none';taskSubmit.textContent=isNew?'新しいタスクを作成':'既存タスクに追加';syncMessageTaskOptions()};taskMode.onchange=syncTaskMode;messageTaskAllDay.onchange=syncMessageTaskOptions;messageTaskCalendarVisible.onchange=syncMessageTaskOptions;syncTaskMode();
  const closeTaskModal=()=>{taskModal.classList.remove('open');taskModal.setAttribute('aria-hidden','true');taskStatus.textContent=''};document.getElementById('messageTaskClose').onclick=closeTaskModal;taskModal.addEventListener('click',e=>{if(e.target===taskModal)closeTaskModal()});
  document.querySelectorAll('.convert-task').forEach(btn=>btn.onclick=()=>{taskForm.reset();taskForm.message_id.value=btn.dataset.id||'';taskMode.value='existing';const text=btn.dataset.text||'';taskForm.title.value=text.slice(0,255);taskForm.description.value=text;taskForm.date.value=String(payload.today||'');taskForm.end_date.value=String(payload.today||'');taskForm.all_day.checked=true;taskForm.calendar_visible.checked=true;taskForm.querySelectorAll('[name=task_assignees]').forEach(x=>x.checked=Number(x.value)===Number(btn.dataset.target||0));syncTaskMode();taskModal.classList.add('open');taskModal.setAttribute('aria-hidden','false')});
  taskForm.onsubmit=async e=>{e.preventDefault();const mode=taskMode.value;const body={action:'convert_task',id:Number(taskForm.message_id.value),mode,csrf};if(mode==='existing'){body.task_id=Number(taskForm.task_id.value||0);body.append_message=taskForm.append_message.checked;}else{body.title=taskForm.title.value.trim();body.description=taskForm.description.value.trim();body.date=taskForm.date.value;body.end_date=taskForm.end_date.value;body.no_date=taskForm.no_date.checked;body.all_day=taskForm.all_day.checked;body.start_time=taskForm.start_time.value;body.end_time=taskForm.end_time.value;body.location=taskForm.location.value.trim();body.assignees=[...taskForm.querySelectorAll('[name=task_assignees]:checked')].map(x=>Number(x.value));body.is_event=Boolean(taskForm.is_event?.checked);body.completion_mode=taskForm.completion_mode.value;body.reminder_at=taskForm.task_reminder_at.value;body.calendar_color=taskForm.calendar_color.value;body.calendar_visible=taskForm.calendar_visible.checked;}taskSubmit.disabled=true;taskStatus.textContent='保存しています…';try{const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('タスクに追加できませんでした。');location.href='/task/view.php?id='+d.id;}catch(_err){taskStatus.textContent='';alert('タスクに追加できませんでした。')}finally{taskSubmit.disabled=false}};
  document.querySelectorAll('.delete-message').forEach(b=>b.onclick=async()=>{if(!confirm('この伝言を削除しますか？'))return;b.disabled=true;try{const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',id:Number(b.dataset.id),csrf})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('削除に失敗しました');location.reload();}catch(_err){alert('削除に失敗しました');b.disabled=false;}});
  const editModal=document.getElementById('messageEditModal'),editForm=document.getElementById('messageEditForm'),editStatus=document.getElementById('messageEditStatus'),editSubmit=document.getElementById('messageEditSubmit');
  const closeEditModal=()=>{editModal.classList.remove('open');editModal.setAttribute('aria-hidden','true');editStatus.textContent=''};document.getElementById('messageEditClose').onclick=closeEditModal;editModal.addEventListener('click',e=>{if(e.target===editModal)closeEditModal()});
  document.querySelectorAll('.edit-message').forEach(b=>b.onclick=()=>{editForm.reset();editForm.message_id.value=b.dataset.id||'';editForm.text.value=b.dataset.text||'';editForm.target_member_id.value=String(Number(b.dataset.target||0));const reminder=String(b.dataset.reminder||'').slice(0,16).replace(' ','T');editForm.reminder_at.value=reminder;editModal.classList.add('open');editModal.setAttribute('aria-hidden','false');setTimeout(()=>editForm.text.focus(),60)});
  editForm.onsubmit=async e=>{e.preventDefault();const body={action:'edit',id:Number(editForm.message_id.value),text:editForm.text.value.trim(),target_member_id:Number(editForm.target_member_id.value||0),reminder_at:editForm.reminder_at.value,csrf};if(!body.text){alert('伝言を入力してください。');return;}editSubmit.disabled=true;editStatus.textContent='保存しています…';try{const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('編集に失敗しました');location.reload();}catch(_err){editStatus.textContent='';alert('編集に失敗しました');}finally{editSubmit.disabled=false}};

  const viewer=document.createElement('div');viewer.className='message-stamp-viewer';viewer.setAttribute('aria-hidden','true');
  const viewerImage=document.createElement('img');viewerImage.alt='スタンプ';
  const viewerClose=document.createElement('button');viewerClose.type='button';viewerClose.className='btn gray';viewerClose.textContent='閉じる';viewer.append(viewerImage,viewerClose);document.body.appendChild(viewer);
  let viewerTimer=0;
  const closeViewer=()=>{if(viewerTimer)clearTimeout(viewerTimer);viewerTimer=0;viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');viewerImage.removeAttribute('src');};
  viewerClose.onclick=closeViewer;viewer.onclick=e=>{if(e.target===viewer)closeViewer();};
  const normalizedFrames=stamp=>Array.isArray(stamp?.frames)?stamp.frames.flatMap(frame=>{const url=sameOriginUrl(frame?.url),durationMs=Number(frame?.durationMs||0);return url&&Number.isSafeInteger(durationMs)&&durationMs>=40&&durationMs<=2000?[{url,durationMs}]:[];}):[];
  const openViewer=stamp=>{
    if(viewerTimer)clearTimeout(viewerTimer);viewerTimer=0;viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');
    const frames=normalizedFrames(stamp);
    if(frames.length>=2){
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){viewerImage.src=frames[0].url;return;}
      let index=0;const play=()=>{const frame=frames[index%frames.length];viewerImage.src=frame.url;index++;viewerTimer=setTimeout(play,frame.durationMs);};play();return;
    }
    const full=sameOriginUrl(stamp?.fullUrl);if(!full){closeViewer();return;}
    const url=new URL(full);url.searchParams.set('stamp_play',String(Date.now()));viewerImage.src=url.href;
  };
  const renderMessageStamps=async()=>{
    try{
      const response=await fetch('/api/message-stamps',{credentials:'same-origin'}),data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!Array.isArray(data.stamps))return;
      const byMessage=new Map(data.stamps.map(stamp=>[Number(stamp?.messageId||0),stamp]));
      document.querySelectorAll('.message-row').forEach(row=>{
        const marker=row.querySelector('.delete-message[data-id],.edit-message[data-id],.convert-task[data-id],.convert-shopping[data-id]');
        const id=Number(marker?.dataset?.id||0),stamp=byMessage.get(id);if(!stamp)return;
        const thumbnail=sameOriginUrl(stamp?.thumbnailUrl);if(!thumbnail)return;
        const image=document.createElement('img');image.className='message-stamp-attached';image.src=thumbnail;image.alt='スタンプ';image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','スタンプを拡大');
        const text=row.firstElementChild;if(text&&text.textContent.trim()==='スタンプ')text.hidden=true;
        if(text)text.insertAdjacentElement('afterend',image);else row.prepend(image);
        image.onclick=()=>openViewer(stamp);image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openViewer(stamp);}};
      });
    }catch{/* stamp enhancement is optional; normal Messages stay usable */}
  };
  void renderMessageStamps();
})();
