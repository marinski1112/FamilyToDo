(()=>{
  const form=document.getElementById('shoppingEditForm');
  const categorySelect=document.getElementById('shoppingEditCategorySelect');
  const categoryCustomWrap=document.getElementById('shoppingEditCategoryCustomWrap');
  const categoryCustom=document.getElementById('shoppingEditCategoryCustom');
  const categoryRegister=document.getElementById('shoppingEditCategoryRegister');
  const categoryValue=document.getElementById('shoppingEditCategoryValue');
  if(!form||!categorySelect||!categoryCustomWrap||!categoryCustom||!categoryRegister||!categoryValue)return;

  let dirty=[...form.querySelectorAll('input:not([type=hidden]),textarea,select')].some(el=>{
    if(el.tagName==='SELECT'){const selected=[...el.options].findIndex(o=>o.defaultSelected);return el.selectedIndex!==(selected<0?0:selected);}
    return ['checkbox','radio'].includes(el.type)?el.checked!==el.defaultChecked:el.value!==el.defaultValue;
  }),saving=false;
  form.addEventListener('input',()=>dirty=true);
  form.addEventListener('change',()=>dirty=true);
  window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
  document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('a[href]'):null;
    if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    const target=new URL(link.href,location.href);
    if(target.origin===location.origin&&target.pathname===location.pathname&&target.search===location.search)return;
    if(saving){event.preventDefault();alert('保存が終わるまでお待ちください。');return;}
    if(dirty){if(!confirm('未保存の買い物編集を破棄して移動しますか？'))event.preventDefault();else dirty=false;}
  },true);
  document.addEventListener('submit',event=>{
    if(saving&&event.target!==form){event.preventDefault();event.stopImmediatePropagation();alert('保存が終わるまでお待ちください。');}
  },true);

  const urlInput=form.querySelector('input[name="url"]');
  const urlLabel=urlInput?[...form.querySelectorAll('label')].find(label=>label.nextElementSibling===urlInput):null;
  if(urlInput&&urlLabel){
    const toggle=document.createElement('button');
    const wrap=document.createElement('div');
    toggle.type='button';
    toggle.className='btn gray small shopping-edit-url-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.textContent='🔗 商品URL';
    wrap.className='shopping-edit-url-disclosure';
    wrap.hidden=true;
    urlLabel.parentNode?.insertBefore(toggle,urlLabel);
    wrap.append(urlLabel,urlInput);
    toggle.after(wrap);
    toggle.addEventListener('click',()=>{
      const open=wrap.hidden;
      wrap.hidden=!open;
      toggle.setAttribute('aria-expanded',open?'true':'false');
      if(open)urlInput.focus();
    });
  }

  const categoryRegisterControl=categoryRegister.closest('label')||categoryRegister.parentElement;
  let categoryRegisterToggle=null;
  if(categoryRegisterControl&&categoryRegisterControl.parentNode){
    categoryRegisterToggle=document.createElement('button');
    categoryRegisterToggle.type='button';
    categoryRegisterToggle.className='btn gray small shopping-edit-category-register-toggle';
    categoryRegisterToggle.setAttribute('aria-expanded','false');
    categoryRegisterToggle.textContent='＋ カテゴリを登録';
    categoryRegisterControl.id=categoryRegisterControl.id||'shoppingEditCategoryRegisterControl';
    categoryRegisterToggle.setAttribute('aria-controls',categoryRegisterControl.id);
    categoryRegisterControl.hidden=true;
    categoryRegisterControl.parentNode.insertBefore(categoryRegisterToggle,categoryRegisterControl);
    categoryRegisterToggle.addEventListener('click',()=>{
      const open=categoryRegisterControl.hidden;
      categoryRegisterControl.hidden=!open;
      categoryRegisterToggle.setAttribute('aria-expanded',open?'true':'false');
      if(open)categoryRegister.focus();
    });
  }

  const MAX_CATEGORY_UNITS=255;
  const syncCategory=()=>{
    const custom=String(categorySelect.value||'')==='__custom__';
    categoryCustomWrap.hidden=!custom;
    if(!custom)categoryRegister.checked=false;
    if(!custom){
      if(categoryRegisterControl)categoryRegisterControl.hidden=true;
      if(categoryRegisterToggle)categoryRegisterToggle.setAttribute('aria-expanded','false');
    }
    categoryValue.value=custom?String(categoryCustom.value||'').trim():String(categorySelect.value||'').trim();
    return categoryValue.value;
  };

  categorySelect.addEventListener('change',syncCategory);
  categoryCustom.addEventListener('input',syncCategory);
  syncCategory();

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving)return;
    const category=syncCategory();
    if(categorySelect.value==='__custom__'&&!category){
      event.preventDefault();
      alert('自由入力のカテゴリー名を入力してください。');
      categoryCustom.focus();
      return;
    }
    if(category.length>MAX_CATEGORY_UNITS){
      event.preventDefault();
      alert(`カテゴリーは${MAX_CATEGORY_UNITS}文字以内で入力してください。`);
      return;
    }
    const registerCategory=categorySelect.value==='__custom__'&&categoryRegister.checked;
    const fields=new FormData(form);
    fields.set('action','save');
    const csrf=String(fields.get('csrf')||'');
    const controls=[...document.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
    saving=true;controls.forEach(([el])=>el.disabled=true);
    try{
      if(registerCategory){
        const categoryResponse=await fetch('/api/shopping-categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,name:category})});
        const categoryData=await categoryResponse.json().catch(()=>null);
        if(!categoryResponse.ok||!categoryData?.ok)throw new Error(categoryData?.error||'カテゴリーの登録に失敗しました。');
      }
      const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{accept:'application/json'},body:fields});
      const contentType=String(response.headers.get('content-type')||'').toLowerCase();
      const data=contentType.includes('application/json')?await response.json().catch(()=>null):null;
      if(response.redirected&&new URL(response.url).pathname.startsWith('/login'))throw new Error('ログイン状態が切れています。入力内容は残しています。別タブでログインし直してから、再度保存してください。');
      if(!response.ok||!data?.ok)throw new Error(data?.error||`保存に失敗しました（HTTP ${response.status}）。入力は残っています。${contentType.includes('text/html')?' ログイン画面などHTML応答が返りました。':''}`);
      const target=new URL(data.redirect,location.href);
      if(target.origin!==location.origin||target.pathname!=='/app/tasks.php')throw new Error('保存結果の移動先を確認できませんでした。');
      dirty=false;saving=false;location.replace(target.pathname+target.search+target.hash);
    }catch(error){
      saving=false;
      alert(error instanceof Error?error.message:'保存に失敗しました。入力は残っています。');
      controls.forEach(([el,disabled])=>el.disabled=disabled);
    }
  });
})();
