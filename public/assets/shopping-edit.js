(()=>{
  const form=document.getElementById('shoppingEditForm');
  const categorySelect=document.getElementById('shoppingEditCategorySelect');
  const categoryCustomWrap=document.getElementById('shoppingEditCategoryCustomWrap');
  const categoryCustom=document.getElementById('shoppingEditCategoryCustom');
  const categoryRegister=document.getElementById('shoppingEditCategoryRegister');
  const categoryValue=document.getElementById('shoppingEditCategoryValue');
  if(!form||!categorySelect||!categoryCustomWrap||!categoryCustom||!categoryRegister||!categoryValue)return;

  const MAX_CATEGORY_UNITS=255;
  const syncCategory=()=>{
    const custom=String(categorySelect.value||'')==='__custom__';
    categoryCustomWrap.hidden=!custom;
    if(!custom)categoryRegister.checked=false;
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
