(()=>{
  'use strict';
  const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
  const button=document.querySelector('.expired-task-more');
  if(!(button instanceof HTMLButtonElement))return;
  button.addEventListener('click',async()=>{
    const section=button.closest('details.expired-tasks');
    const list=section?.querySelector('.expired-list');
    const count=section?.querySelector('.expired-task-count');
    if(!(list instanceof HTMLElement)||button.disabled)return;
    button.disabled=true;
    button.textContent='読み込み中…';
    try{
      const query=new URLSearchParams({
        date:String(payload.date||''),
        overdue:'tasks',
        cursor_due:button.dataset.cursorDue||'',
        cursor_id:button.dataset.cursorId||'',
      });
      const response=await fetch(`/app/tasks.php?${query}`,{credentials:'same-origin',headers:{accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error('overdue task page failed');
      list.insertAdjacentHTML('beforeend',String(data.html||''));
      const loaded=section?.querySelectorAll('[data-expired-task-id]').length||0;
      if(count)count.textContent=`${loaded}件表示${data.hasMore?'（続きあり）':''}`;
      if(data.hasMore&&data.cursor?.due&&Number(data.cursor?.id)>0){
        button.dataset.cursorDue=String(data.cursor.due);
        button.dataset.cursorId=String(data.cursor.id);
        button.disabled=false;
        button.textContent='続きを表示';
      }else button.remove();
    }catch{
      button.disabled=false;
      button.textContent='続きを表示';
      alert('期限切れタスクの続きを読み込めませんでした。');
    }
  });
})();
