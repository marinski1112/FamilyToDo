(()=>{
  'use strict';
  const root=document.documentElement;
  const errorBox=document.getElementById('familyActionError');
  const setError=(message)=>{
    if(!errorBox) return;
    errorBox.textContent=String(message||'処理に失敗しました。');
    errorBox.style.display='block';
  };
  async function submitForm(form){
    const endpoint=String(form.dataset.endpoint||'');
    if(!endpoint) return;
    const button=form.querySelector('button[type="submit"],button:not([type])');
    const original=button?button.textContent:'';
    try{
      if(errorBox) errorBox.style.display='none';
      if(button){button.disabled=true;button.textContent='処理中…';}
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json','accept':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok) throw new Error(data?.error||('処理に失敗しました（HTTP '+response.status+'）。'));
      const target=String(data.redirect||'/app/index.php');
      location.replace(target.startsWith('/')?target:'/app/index.php');
    }catch(e){
      setError(e&&e.message?e.message:String(e));
      if(button){button.disabled=false;button.textContent=original||'送信';}
    }
  }
  document.querySelectorAll('form[data-family-endpoint]').forEach(form=>{
    form.addEventListener('submit',e=>{e.preventDefault();submitForm(form);});
  });
  root.dataset.familyOnboardingJs='ready';
})();
