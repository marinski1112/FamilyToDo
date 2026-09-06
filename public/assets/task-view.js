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
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

  const loadDirectChildren=async()=>{
    if(toggleType!=='task'||id<=0)return;
    try{
      const r=await fetch(`/api/task-children?parent_id=${encodeURIComponent(String(id))}`,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store'}),d=await r.json().catch(()=>null);
      if(!r.ok||!d?.ok||!Array.isArray(d.children)||!d.children.length)return;
      const card=document.createElement('div');card.className='card';card.id='taskDirectChildren';
      card.innerHTML=`<div class="section-head"><h2>✅ 子タスク <span class="small">(${d.children.length})</span></h2></div>${d.children.map(child=>`<div class="row"><div><strong class="${child.status==='completed'?'done':''}">${esc(child.title)}</strong><div class="meta">${[child.dueDate?`期限 ${child.dueDate}${child.dueTime?' '+child.dueTime:''}`:'期限なし',child.assignees?`担当 ${child.assignees}`:'担当なし',child.completionMode==='ALL'?'全員完了':'誰か1人で完了'].map(esc).join(' ・ ')}</div></div><div><a class="btn gray small" href="/task/view.php?id=${Number(child.id)}">詳細</a>${child.canEdit?` <a class="btn gray small" href="/task/edit.php?id=${Number(child.id)}">編集</a>`:''}</div></div>`).join('')}`;
      const firstChildCard=document.querySelector('.task-child-toggle')?.closest('.card');
      if(firstChildCard)firstChildCard.before(card);else payloadEl.before(card);
    }catch{/* child list is supplementary; main detail remains usable */}
  };
  loadDirectChildren();

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
