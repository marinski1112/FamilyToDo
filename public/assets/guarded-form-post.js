(()=>{
  'use strict';
  document.querySelectorAll('form[data-draft-post]').forEach(form=>{
    const guard=window.FamilyTodoDraftGuard.attach(form);
    const status=document.createElement('p');status.className='error';status.setAttribute('role','alert');status.hidden=true;form.append(status);
    let uncertain=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(guard.isSaving()||uncertain)return;
      const fields=new FormData(form);fields.set('action','save');
      if(!guard.startSaving())return;status.hidden=true;
      let rejectedBeforeSave=false;
      try{
        const response=await fetch(form.action,{method:'POST',headers:{accept:'application/json'},body:fields});
        rejectedBeforeSave=[400,401,403,404,405,422].includes(response.status);
        const data=await response.json().catch(()=>null);
        if(!response.ok||data?.ok!==true)throw new Error('SAVE_FAILED');
        const target=new URL(data.redirect,location.href);
        if(target.origin!==location.origin||target.pathname!==form.dataset.successPath)throw new Error('SAVE_FAILED');
        guard.saved();location.replace(target.pathname+target.search+target.hash);
      }catch{
        guard.failed();uncertain=form.hasAttribute('data-create-record')&&!rejectedBeforeSave;
        status.textContent=uncertain?'保存結果を確認できません。入力は残っています。二重登録を避けるため、日記一覧で保存結果を確認してください。':'保存に失敗しました。入力は残っています。内容や通信状態を確認して、もう一度保存してください。';status.hidden=false;
        if(uncertain)form.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=true);
      }
    });
  });
})();
