(()=>{
  'use strict';
  const labelControls=form=>{
    for(const label of form.querySelectorAll('label')){
      if(label.querySelector('input,select,textarea')||label.htmlFor)continue;
      const next=label.nextElementSibling,input=next?.matches('input,select,textarea')?next:next?.matches('.native-control-shell')?next.querySelector('input'):null;
      if(!input)continue;if(!input.id)input.id=form.id+'-'+input.name;label.htmlFor=input.id;
    }
    form.addEventListener('invalid',event=>{for(let el=event.target.parentElement;el&&el!==form;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;},true);
  };
  const foldNodes=(parent,nodes,title)=>{
    if(!nodes.length)return;
    const details=document.createElement('details');details.className='message-options';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);parent.insertBefore(details,nodes[0]);nodes.forEach(node=>details.append(node));return details;
  };
  for(const form of document.querySelectorAll('#msgForm,#messageNew,#messageEditForm')){
    labelControls(form);
    const reminder=form.querySelector('[name=reminder_at]');if(!reminder)continue;
    const control=reminder.closest('.native-control-shell')||reminder,label=control.previousElementSibling,help=control.nextElementSibling;
    const details=foldNodes(form,[label,control,help?.matches('.small')?help:null].filter(Boolean),'通知予約（任意）');
    if(details&&reminder.value)details.open=true;
  }
  const composer=document.querySelector('#msgForm')?.closest('.form-card'),head=document.querySelector('.page-head');
  if(composer&&head){
    const details=document.createElement('details');details.className='message-compose';details.id='messageCompose';const summary=document.createElement('summary');summary.textContent='✏️ 伝言を書く';details.append(summary,composer);head.after(details);
    head.querySelector('a[href="/app/message_new.php"]')?.addEventListener('click',event=>{event.preventDefault();details.open=true;composer.querySelector('textarea')?.focus();});
  }
  for(const row of document.querySelectorAll('.message-row')){
    const text=row.firstElementChild;
    if(text&&text.textContent.length>180){
      text.classList.add('message-content-clamped');const button=document.createElement('button');button.type='button';button.className='message-expand';button.textContent='続きを読む';button.setAttribute('aria-expanded','false');
      button.onclick=()=>{const collapsed=text.classList.toggle('message-content-clamped');button.textContent=collapsed?'続きを読む':'短く表示';button.setAttribute('aria-expanded',String(!collapsed));};text.after(button);
    }
    const task=row.querySelector('.convert-task'),shopping=row.querySelector('.convert-shopping');
    const extras=[shopping,...row.querySelectorAll('.edit-message,.delete-message')].filter(Boolean);
    if(extras.length){const details=document.createElement('details');details.className='message-more';const summary=document.createElement('summary');summary.textContent='その他の操作';const actions=document.createElement('div');actions.className='message-actions';details.append(summary,actions);extras.forEach(node=>actions.append(node));row.append(details);}
    row.querySelectorAll('.message-actions').forEach(node=>{if(!node.children.length)node.remove();});
    if(task)task.textContent='✨ AIでタスクに追加';
  }
  const taskForm=document.getElementById('messageTaskForm'),modal=document.getElementById('messageTaskModal');
  for(const form of document.querySelectorAll('#messageTaskForm,#messageShoppingForm'))labelControls(form);
  for(const button of document.querySelectorAll('#messageTaskClose,#messageShoppingClose,#messageEditClose'))button.setAttribute('aria-label','閉じる');
  if(!taskForm||!modal)return;
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','伝言からタスクに追加');
  modal.querySelector('h2').textContent='伝言から追加';
  const fields=document.getElementById('newTaskFields');
  const kept=new Set([fields.querySelector('[name=title]'),fields.querySelector('[name=title]')?.previousElementSibling,fields.querySelector('.date-option-row')]);
  foldNodes(fields,[...fields.children].filter(node=>!kept.has(node)),'説明・担当者・通知など');
  const shoppingForm=document.getElementById('messageShoppingForm');
  if(shoppingForm){
    const keep=new Set([...shoppingForm.querySelectorAll('input[type=hidden],input[name=name],input[name=quantity],select[name=task_id],button[type=submit],#messageShoppingStatus')]);
    for(const node of [...keep])if(node.previousElementSibling?.tagName==='LABEL')keep.add(node.previousElementSibling);
    foldNodes(shoppingForm,[...shoppingForm.children].filter(node=>!keep.has(node)),'分類・日付・担当者など');
  }
  const status=document.createElement('p');status.className='message-ai-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=document.createElement('button');retry.type='button';retry.className='message-ai-retry';retry.textContent='もう一度AIで整理';taskForm.prepend(status,retry);
  const mode=taskForm.elements.mode,select=taskForm.elements.task_id;
  const submit=document.getElementById('messageTaskSubmit');
  const csrf=JSON.parse(document.getElementById('messagesPayload')?.textContent||'{}').csrf||'';
  let generation=0,controller=null,dirty=false,applying=false,returnFocus=null;
  const cache=new Map();
  const setMode=value=>{applying=true;mode.value=value;mode.dispatchEvent(new Event('change'));applying=false;};
  const setOriginal=(button)=>{
    taskForm.elements.date.value='';taskForm.elements.end_date.value='';taskForm.elements.no_date.checked=true;taskForm.elements.description.value=button.dataset.text||'';setMode('new');delete taskForm.dataset.messageUpdatedAt;delete taskForm.dataset.messageOriginalText;
  };
  const cancel=()=>{generation++;controller?.abort();controller=null;retry.disabled=false;if(taskForm.dataset.saving!=='1')submit.disabled=false;};
  for(const event of ['input','change'])taskForm.addEventListener(event,()=>{if(!applying)dirty=true;});
  async function analyze(button,force=false){
    if(taskForm.dataset.saving==='1')return;
    cancel();const requestId=generation,id=Number(button.dataset.id),key=id+'\n'+button.dataset.text;
    dirty=false;status.textContent='伝言を要約し、近い予定を探しています…';retry.disabled=true;submit.disabled=true;controller=new AbortController();const activeController=controller,signal=activeController.signal;const timeout=setTimeout(()=>activeController.abort(),45000);
    try{
      let data=force?null:cache.get(key);
      if(!data){
        const response=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',signal,body:JSON.stringify({action:'ai_draft',id,csrf})});data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok)throw new Error(response.status===400?'文章のある伝言（4,000文字以内）でお試しください。':'AIの下書きを作れませんでした。手入力でも追加できます。');
        if(requestId!==generation)return;
        if(!data.already)cache.set(key,data);
      }
      if(requestId!==generation||!modal.classList.contains('open'))return;
      if(data.already){status.textContent='この伝言はタスクに追加済みです。';return;}
      if(dirty){status.textContent='入力を変更したため、下書きの自動反映を止めました。';return;}
      applying=true;
      const item=data.item||{};taskForm.elements.title.value=String(item.title||button.dataset.text||'').slice(0,255);taskForm.elements.description.value=data.originalText||button.dataset.text||'';
      taskForm.elements.date.value=item.dueDate||'';taskForm.elements.end_date.value=item.dueDate||'';taskForm.elements.no_date.checked=!item.dueDate;taskForm.elements.start_time.value=item.dueTime||'';taskForm.elements.all_day.checked=!item.dueTime;
      taskForm.dataset.messageUpdatedAt=String(data.messageUpdatedAt||'');
      taskForm.dataset.messageOriginalText=String(data.originalText||'');
      const previous=select.querySelector('optgroup[data-ai]');
      if(previous){[...previous.children].forEach(option=>select.append(option));previous.remove();}
      const group=document.createElement('optgroup');group.label='近い用件の候補';group.dataset.ai='1';
      for(const candidate of data.suggestions||[]){
        let option=[...select.options].find(option=>Number(option.value)===candidate.id);if(!option)option=document.createElement('option');option.value=String(candidate.id);option.textContent=candidate.title+(candidate.date?' ・ '+candidate.date:'');group.append(option);
      }
      if(group.children.length)select.prepend(group);
      select.value=String(data.suggestedTaskId||0);setMode(data.suggestedTaskId?'existing':'new');applying=false;dirty=false;
      status.textContent=(data.source==='gemini'?'AIで要約しました。':'AIを利用できなかったため、原文から下書きを用意しました。')+(data.suggestedTaskId?'似たタスクを選んでいます。追加先をご確認ください。':'新しいタスクとして内容をご確認ください。')+' 日付の基準：'+data.referenceDate;
    }catch(error){if(requestId===generation)status.textContent=signal.aborted?'時間がかかっています。手入力するか、もう一度お試しください。':error.message;}
    finally{clearTimeout(timeout);if(requestId===generation){retry.disabled=false;submit.disabled=false;controller=null;}}
  }
  let currentButton=null;
  document.querySelectorAll('.convert-task').forEach(button=>{
    const open=button.onclick;
    button.onclick=()=>{if(taskForm.dataset.saving==='1')return;returnFocus=button;open?.call(button);currentButton=button;setOriginal(button);mode.focus();void analyze(button);};
  });
  retry.onclick=()=>{if(currentButton)void analyze(currentButton,true);};
  new MutationObserver(()=>{if(!modal.classList.contains('open')){cancel();returnFocus?.focus();}}).observe(modal,{attributes:true,attributeFilter:['class']});
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();document.getElementById('messageTaskClose').click();}
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length),first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
})();
