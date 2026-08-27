(()=>{
  'use strict';
  const payloadEl=document.getElementById('taskViewPayload');
  if(!payloadEl)return;
  let cfg={};
  try{cfg=JSON.parse(payloadEl.textContent||'{}');}catch(e){console.error('[Family TODO LINE] task view payload',e);return;}
  const csrf=String(cfg.csrf||'');
  const id=Number(cfg.id||0);
  const occurrenceId=Number(cfg.occurrenceId||0);
  const toggleType=String(cfg.toggleType||'task');
  const returnUrl=String(cfg.returnUrl||'/app/tasks.php');

  const doneToggle=document.getElementById('done');
  if(doneToggle){
    doneToggle.addEventListener('change',async e=>{
      const target=e.currentTarget;
      const checked=Boolean(target.checked);
      target.disabled=true;
      try{
        const r=await fetch('/api/toggle',{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          credentials:'same-origin',
          body:JSON.stringify({type:toggleType,id,occurrence_id:occurrenceId,completed:checked,csrf})
        });
        const d=await r.json().catch(()=>null);
        if(!r.ok||!d?.ok)throw new Error(d?.error||'更新に失敗しました');
        const status=document.getElementById('taskStatus');
        if(status)status.textContent=d.status==='completed'?'完了':'未完了';
      }catch(err){
        target.checked=!checked;
        alert(err?.message||String(err));
      }finally{target.disabled=false;}
    });
  }

  document.querySelectorAll('.task-child-toggle').forEach(el=>{
    el.addEventListener('change',async()=>{
      const checked=Boolean(el.checked);
      el.disabled=true;
      try{
        const r=await fetch('/api/toggle',{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          credentials:'same-origin',
          body:JSON.stringify({type:String(el.dataset.type||''),id:Number(el.dataset.id||0),completed:checked,csrf})
        });
        const d=await r.json().catch(()=>null);
        if(!r.ok||!d?.ok)throw new Error(d?.error||'更新に失敗しました');
        el.nextElementSibling?.classList.toggle('done',checked);
      }catch(e){
        el.checked=!checked;
        alert(e?.message||String(e));
      }finally{el.disabled=false;}
    });
  });

  const normalDelete=document.getElementById('del');
  if(normalDelete){
    normalDelete.addEventListener('click',async()=>{
      if(!confirm('このタスクを削除しますか？'))return;
      normalDelete.disabled=true;
      try{
        const r=await fetch('/api/task?id='+encodeURIComponent(String(id)),{
          method:'DELETE',headers:{'x-csrf':csrf,'accept':'application/json'},credentials:'same-origin'
        });
        const d=await r.json().catch(()=>null);
        if(!r.ok||!d?.ok)throw new Error(d?.error||'削除に失敗しました。');
        location.href=returnUrl;
      }catch(e){alert(e?.message||String(e));normalDelete.disabled=false;}
    });
  }

  const exceptionModal=document.getElementById('exceptionDeleteModal');
  const exceptionOpen=document.getElementById('exceptionDeleteOpen');
  if(exceptionModal&&exceptionOpen){
    const close=()=>{exceptionModal.classList.remove('open');exceptionModal.setAttribute('aria-hidden','true');};
    exceptionOpen.addEventListener('click',()=>{exceptionModal.classList.add('open');exceptionModal.setAttribute('aria-hidden','false');});
    document.getElementById('exceptionDeleteClose')?.addEventListener('click',close);
    exceptionModal.addEventListener('click',e=>{if(e.target===exceptionModal)close();});
    const remove=async mode=>{
      const buttons=[...exceptionModal.querySelectorAll('button')];
      buttons.forEach(b=>b.disabled=true);
      try{
        const r=await fetch('/api/task?id='+encodeURIComponent(String(id))+'&exception_mode='+encodeURIComponent(mode),{
          method:'DELETE',headers:{'x-csrf':csrf,'accept':'application/json'},credentials:'same-origin'
        });
        const d=await r.json().catch(()=>null);
        if(!r.ok||!d?.ok)throw new Error(d?.error||'削除に失敗しました。');
        location.href=returnUrl;
      }catch(e){alert(e?.message||String(e));buttons.forEach(b=>b.disabled=false);}
    };
    document.getElementById('exceptionDeleteRestore')?.addEventListener('click',()=>remove('restore'));
    document.getElementById('exceptionDeleteExclude')?.addEventListener('click',()=>remove('exclude'));
  }
  document.documentElement.dataset.taskViewJs='ready';
})();
