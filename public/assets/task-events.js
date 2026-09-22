(()=>{
  'use strict';
  const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
  document.querySelectorAll('details.expired-tasks').forEach(section=>{section.open=true;});

  const taskSection=document.querySelector('.task-section');
  const childCreateKey=form=>String(form.dataset.taskCreateKey||(form.dataset.taskCreateKey=crypto.randomUUID()));
  const rotateChildCreateKey=form=>{form.dataset.taskCreateKey=crypto.randomUUID();};
  const createChildComposer=(parentId,parentPrivate=false)=>{
    const form=document.createElement('form');
    form.className='task-child-composer';
    form.dataset.parentTaskId=String(parentId);
    form.dataset.parentPrivate=parentPrivate?'1':'0';
    form.innerHTML='<div class="task-child-composer-line"><span class="task-child-branch" aria-hidden="true">└</span><input class="task-child-title" type="text" maxlength="255" autocomplete="off" enterkeyhint="done" placeholder="子タスクを追加" aria-label="子タスクを追加"><button class="btn small secondary task-child-add" type="submit">追加</button></div><div class="task-child-status" role="status" aria-live="polite"></div>';
    return form;
  };
  const ensureRootChildComposer=row=>{
    if(!(row instanceof HTMLElement)||row.classList.contains('event-task-row'))return;
    const checkbox=row.querySelector(':scope > .task-main-row .task-main > .toggle[data-type="task"][data-id]');
    if(!(checkbox instanceof HTMLInputElement))return;
    const parentId=Number(checkbox.dataset.id||0);if(!Number.isInteger(parentId)||parentId<=0)return;
    let container=row.querySelector(':scope > .task-children');
    if(!(container instanceof HTMLElement)){container=document.createElement('div');container.className='task-children';container.dataset.parentTaskId=String(parentId);row.append(container);}
    let form=container.querySelector(':scope > .task-child-composer');
    if(!(form instanceof HTMLFormElement)){form=createChildComposer(parentId,row.dataset.taskPrivate==='1');container.append(form);}
    form.hidden=checkbox.checked;
  };
  if(taskSection){
    new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){
        if(!(node instanceof HTMLElement))continue;
        if(node.matches('.task-row.reminders-new-row:not(.event-task-row)'))ensureRootChildComposer(node);
        node.querySelectorAll?.('.task-row.reminders-new-row:not(.event-task-row)').forEach(ensureRootChildComposer);
      }
    }).observe(taskSection,{childList:true,subtree:true});
  }

  let completedTasks=null;
  const completedTaskRows=()=>completedTasks?[...completedTasks.querySelectorAll(':scope > .task-row')]:[];
  const updateCompletedSummary=()=>{
    if(!completedTasks)return;
    const count=completedTaskRows().length;
    const summary=completedTasks.querySelector(':scope > summary');
    if(summary)summary.textContent=`完了済み ${count}件`;
    if(count===0){completedTasks.remove();completedTasks=null;}
  };
  const ensureCompletedTasks=()=>{
    if(completedTasks||!taskSection)return completedTasks;
    completedTasks=document.createElement('details');
    completedTasks.className='completed-tasks';
    const summary=document.createElement('summary');
    summary.textContent='完了済み';
    completedTasks.append(summary);
    taskSection.append(completedTasks);
    return completedTasks;
  };
  const moveCompletedTaskRow=(checkbox,completed)=>{
    if(!taskSection||checkbox.closest('.task-child-row'))return;
    const row=checkbox.closest('.task-row:not(.event-task-row)');
    if(!row)return;
    const composer=row.querySelector(':scope > .task-children > .task-child-composer');
    if(composer instanceof HTMLFormElement)composer.hidden=completed;
    if(completed){
      const section=ensureCompletedTasks();
      if(section&&row.parentElement!==section)section.append(row);
    }else if(completedTasks&&row.parentElement===completedTasks){
      taskSection.insertBefore(row,completedTasks);
    }
    updateCompletedSummary();
  };

  taskSection?.querySelectorAll('.task-row:not(.event-task-row)').forEach(row=>{
    const checkbox=row.querySelector('.task-main-row .task-main > .toggle[data-type="task"],.task-main-row .task-main > .toggle[data-type="recurrence"]');
    if(checkbox instanceof HTMLInputElement&&checkbox.checked)moveCompletedTaskRow(checkbox,true);
  });

  const appendChildRow=(form,id,title,isPrivate)=>{
    const container=form.closest('.task-children');if(!(container instanceof HTMLElement))return;
    if(container.querySelector(`:scope > .task-child-row[data-task-id="${id}"]`))return;
    const row=document.createElement('div');row.className='row task-child-row reminders-new-row';row.dataset.taskId=String(id);
    const main=document.createElement('div');main.className='task-main-row';
    const label=document.createElement('label');label.className='task-main';
    const checkbox=document.createElement('input');checkbox.className='check toggle';checkbox.type='checkbox';checkbox.dataset.type='task';checkbox.dataset.id=String(id);
    const span=document.createElement('span');
    if(isPrivate){const badge=document.createElement('span');badge.className='private-task-badge';badge.title='自分専用';badge.textContent='🔒';span.append(badge,document.createTextNode(' '));}
    span.append(document.createTextNode(title));label.append(checkbox,span);
    const actions=document.createElement('div');actions.className='checklist-row-actions';
    const detail=document.createElement('a');detail.className='checklist-row-action';detail.href=`/task/view.php?id=${id}`;detail.setAttribute('aria-label',`${title}の詳細`);detail.textContent='詳細';
    const shopping=document.createDocumentFragment();
    actions.append(detail,shopping);main.append(label,actions);row.append(main);
    const meta=document.createElement('div');meta.className='meta';row.append(meta);
    container.insertBefore(row,form);
  };

  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||!form.matches('.task-child-composer'))return;
    event.preventDefault();
    if(form.dataset.saving==='1')return;
    const input=form.querySelector('.task-child-title'),button=form.querySelector('.task-child-add'),status=form.querySelector('.task-child-status');
    if(!(input instanceof HTMLInputElement)||!(button instanceof HTMLButtonElement))return;
    const title=input.value.trim(),parentId=Number(form.dataset.parentTaskId||0),parentPrivate=form.dataset.parentPrivate==='1';
    if(!title){input.focus({preventScroll:true});return;}
    if(!Number.isInteger(parentId)||parentId<=0){if(status)status.textContent='親タスクを確認できませんでした。';return;}
    const createKey=childCreateKey(form);form.dataset.saving='1';input.disabled=true;button.disabled=true;if(status)status.textContent='保存中…';
    try{
      let response;
      try{
        response=await fetch('/api/task',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','Idempotency-Key':createKey},body:JSON.stringify({
          csrf:String(payload.csrf||''),title,description:'',is_event:false,is_private:parentPrivate,
          dateOnly:'',endDateOnly:'',noDate:true,allDay:true,startTime:'',endTime:'',location:'',
          calendar_visible:false,calendar_color:'',completion_mode:'ANY',assignees:[],reminderAt:'',shopping:[],items:[],parent_task_id:parentId,
        })});
      }catch{throw new Error('通信が途切れました。保存済みの可能性があるため、再試行する前に一覧を確認してください。');}
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){
        const code=String(data?.code||'');
        if(!response.ok&&response.status<500&&!['IDEMPOTENCY_IN_PROGRESS','IDEMPOTENCY_LEASE_LOST'].includes(code))rotateChildCreateKey(form);
        throw new Error(String(data?.error||'保存に失敗しました。'));
      }
      const id=Number(data.id||0);if(!Number.isInteger(id)||id<=0)throw new Error('保存結果を確認できませんでした。');
      appendChildRow(form,id,title,parentPrivate);input.value='';rotateChildCreateKey(form);if(status)status.textContent='';
    }catch(error){if(status)status.textContent=error?.message||String(error)||'保存に失敗しました。';}
    finally{form.dataset.saving='0';input.disabled=false;button.disabled=false;requestAnimationFrame(()=>input.focus({preventScroll:true}));}
  });

  document.addEventListener('change',async event=>{
    const el=event.target;
    if(!(el instanceof HTMLInputElement)||!el.matches('.toggle[data-type][data-id]'))return;
    const checked=el.checked;
    el.disabled=true;
    try{
      const response=await fetch('/api/toggle',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({type:el.dataset.type,id:Number(el.dataset.id),occurrence_id:Number(el.dataset.occurrenceId||0),completed:checked,csrf:String(payload.csrf||'')})});
      const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
      if(!response.ok||!data.ok)throw new Error(data.error||'更新に失敗しました。');
      const serverCompleted=String(data.status)==='completed';
      el.parentElement?.querySelector('span')?.classList.toggle('done',checked);
      if(el.dataset.type==='task'||el.dataset.type==='recurrence')moveCompletedTaskRow(el,serverCompleted);
      const expiredRow=el.closest('[data-expired-task-id]');
      if(expiredRow){
        expiredRow.classList.toggle('completed',checked);
        expiredRow.querySelector('.expired-task-main > span')?.classList.toggle('done',checked);
        expiredRow.dataset.serverCompleted=serverCompleted?'1':'0';
      }
      el.dispatchEvent(new CustomEvent('familytodo:toggle-success',{bubbles:true,detail:{completed:serverCompleted}}));
    }catch(error){
      el.checked=!checked;
      alert(error?.message||String(error));
    }finally{el.disabled=false;}
  });

  const overdueTaskMore=document.querySelector('.expired-task-more');
  if(overdueTaskMore instanceof HTMLButtonElement){
    overdueTaskMore.addEventListener('click',async()=>{
      const section=overdueTaskMore.closest('details.expired-tasks');
      const list=section?.querySelector('.expired-list');
      const count=section?.querySelector('.expired-task-count');
      if(!(list instanceof HTMLElement)||overdueTaskMore.disabled)return;
      overdueTaskMore.disabled=true;
      overdueTaskMore.textContent='読み込み中…';
      try{
        const query=new URLSearchParams({
          date:String(payload.date||''),
          overdue:'tasks',
          cursor_due:overdueTaskMore.dataset.cursorDue||'',
          cursor_id:overdueTaskMore.dataset.cursorId||'',
        });
        const response=await fetch(`/app/tasks.php?${query}`,{credentials:'same-origin',headers:{accept:'application/json'}});
        const data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok)throw new Error('overdue task page failed');
        list.insertAdjacentHTML('beforeend',String(data.html||''));
        const loaded=section?.querySelectorAll('[data-expired-task-id]').length||0;
        if(count)count.textContent=`${loaded}件表示${data.hasMore?'（続きあり）':''}`;
        if(data.hasMore&&data.cursor?.due&&Number(data.cursor?.id)>0){
          overdueTaskMore.dataset.cursorDue=String(data.cursor.due);
          overdueTaskMore.dataset.cursorId=String(data.cursor.id);
          overdueTaskMore.disabled=false;
          overdueTaskMore.textContent='続きを表示';
        }else overdueTaskMore.remove();
      }catch{
        overdueTaskMore.disabled=false;
        overdueTaskMore.textContent='続きを表示';
        alert('期限切れタスクの続きを読み込めませんでした。');
      }
    });
  }

  // Goods content and reusable-set assets are loaded once by app-shell.ts.
})();
