(()=>{
  'use strict';
  const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
  document.querySelectorAll('details.expired-tasks').forEach(section=>{section.open=true;});

  const taskSection=document.querySelector('.task-section');
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
    if(!taskSection)return;
    const row=checkbox.closest('.task-row:not(.event-task-row)');
    if(!row)return;
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
    }catch(error){
      el.checked=!checked;
      alert(error?.message||String(error));
    }finally{el.disabled=false;}
  });
})();
