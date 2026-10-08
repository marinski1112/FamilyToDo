(()=>{
  'use strict';
  const controllers=new WeakMap();
  const fields=form=>[...form.querySelectorAll('input:not([type=hidden]),textarea,select')];
  const value=el=>['checkbox','radio'].includes(el.type)?String(el.checked):el.type==='file'?[...el.files].map(f=>`${f.name}:${f.size}:${f.lastModified}`).join('|'):String(el.value);
  const initialChanged=form=>fields(form).some(el=>{
    if(el.tagName==='SELECT'){const initial=[...el.options].find(o=>o.hasAttribute('selected'))||el.options[0];return el.value!==String(initial?.value||'');}
    return ['checkbox','radio'].includes(el.type)?el.checked!==el.defaultChecked:el.type==='file'?el.files.length>0:el.value!==el.defaultValue;
  });
  const attach=(form,options={})=>{
    if(controllers.has(form))return controllers.get(form);
    const baseline=new Map(fields(form).map(el=>[el,value(el)])),retryKeys=new Map();
    let earlyDirty=options.initialDirty??initialChanged(form),saving=false,controls=[];
    const dirty=()=>earlyDirty||fields(form).some(el=>{
      const original=baseline.get(el);
      if(original!==undefined)return original!==value(el);
      return ['checkbox','radio'].includes(el.type)?el.checked!==el.defaultChecked:el.value!==el.defaultValue;
    });
    const message=options.message||'未保存の入力を破棄して移動しますか？';
    window.addEventListener('beforeunload',event=>{if(dirty()||saving){event.preventDefault();event.returnValue='';}});
    document.addEventListener('click',event=>{
      const link=event.target instanceof Element?event.target.closest('a[href]'):null;
      if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
      const target=new URL(link.href,location.href);
      if(target.origin===location.origin&&target.pathname===location.pathname&&target.search===location.search)return;
      if(saving){event.preventDefault();alert('保存が終わるまでお待ちください。');return;}
      if(dirty()){
        if(!confirm(message)){event.preventDefault();return;}
        earlyDirty=false;fields(form).forEach(el=>baseline.set(el,value(el)));
      }
    },true);
    document.addEventListener('submit',event=>{
      if(saving&&event.target!==form){event.preventDefault();event.stopImmediatePropagation();alert('保存が終わるまでお待ちください。');}
    },true);
    const controller={
      isSaving:()=>saving,
      isDirty:dirty,
      retryKey(signature,scope='create'){
        const previous=retryKeys.get(scope);
        if(previous?.signature===signature)return previous.key;
        const key=crypto.randomUUID?crypto.randomUUID():[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
        retryKeys.set(scope,{signature,key});return key;
      },
      forgetRetry(scope='create'){retryKeys.delete(scope);},
      startSaving(){
        if(saving)return false;
        saving=true;controls=[...document.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
        controls.forEach(([el])=>el.disabled=true);return true;
      },
      failed(){saving=false;controls.forEach(([el,disabled])=>el.disabled=disabled);controls=[];},
      saved(){earlyDirty=false;fields(form).forEach(el=>baseline.set(el,value(el)));saving=false;},
    };
    controllers.set(form,controller);return controller;
  };
  window.FamilyTodoDraftGuard={attach,initialChanged};
})();
