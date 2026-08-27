(()=>{
  'use strict';
  const root=document.documentElement;
  const form=document.getElementById('itemForm');
  if(!form){root.dataset.itemNewJs='missing';return;}
  const errorBox=document.getElementById('itemFormError');
  const setError=(message)=>{
    if(!errorBox) return;
    errorBox.textContent=String(message||'登録に失敗しました。');
    errorBox.style.display='block';
  };
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=form.querySelector('button[type="submit"],button:not([type])');
    const original=button?button.textContent:'';
    try{
      if(errorBox) errorBox.style.display='none';
      if(button){button.disabled=true;button.textContent='登録中…';}
      const body=Object.fromEntries(new FormData(form));
      body.assignees=[...form.querySelectorAll('[name="assignees"]:checked')].map(x=>Number(x.value)).filter(Number.isFinite);
      body.task_id=Number(form.elements.task_id?.value||0);
      const response=await fetch('/api/item',{
        method:'POST',
        headers:{'content-type':'application/json','accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify(body)
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok) throw new Error(data?.error||('登録に失敗しました（HTTP '+response.status+'）。'));
      const date=String(data.date||body.date||'');
      location.href='/app/tasks.php'+(date?'?date='+encodeURIComponent(date):'');
    }catch(err){
      setError(err&&err.message?err.message:String(err));
      if(button){button.disabled=false;button.textContent=original||'登録する';}
    }
  });
  root.dataset.itemNewJs='ready';
})();
