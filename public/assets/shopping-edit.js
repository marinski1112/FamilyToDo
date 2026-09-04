(()=>{
  const form=document.getElementById('shoppingEditForm');
  const categorySelect=document.getElementById('shoppingEditCategorySelect');
  const categoryCustomWrap=document.getElementById('shoppingEditCategoryCustomWrap');
  const categoryCustom=document.getElementById('shoppingEditCategoryCustom');
  const categoryRegister=document.getElementById('shoppingEditCategoryRegister');
  const categoryValue=document.getElementById('shoppingEditCategoryValue');
  if(!form||!categorySelect||!categoryCustomWrap||!categoryCustom||!categoryRegister||!categoryValue)return;

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
    if(!custom){
      categoryRegister.checked=false;
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
    if(!registerCategory)return;

    event.preventDefault();
    const csrf=String(new FormData(form).get('csrf')||'');
    const button=form.querySelector('button[type="submit"],button[name="action"]');
    if(button)button.disabled=true;
    try{
      const response=await fetch('/api/shopping-categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,name:category})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||'カテゴリーの登録に失敗しました。');
      form.submit();
    }catch(error){
      alert(error instanceof Error?error.message:'カテゴリーの登録に失敗しました。');
      if(button)button.disabled=false;
    }
  });
})();