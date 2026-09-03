(()=>{
  'use strict';
  const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
  document.querySelectorAll('details.expired-tasks').forEach(section=>{section.open=true;});
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
