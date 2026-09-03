(()=>{
  const payloadEl=document.getElementById('shoppingCategoryAdminPayload');
  const list=document.getElementById('shoppingCategoryList');
  const status=document.getElementById('shoppingCategoryAdminStatus');
  if(!payloadEl||!list)return;
  let payload={};
  try{payload=JSON.parse(payloadEl.textContent||'{}');}catch{}
  const setStatus=(message,isError=false)=>{
    if(!status)return;
    status.textContent=message;
    status.dataset.error=isError?'1':'0';
  };
  list.addEventListener('click',async(event)=>{
    const button=event.target instanceof Element?event.target.closest('[data-shopping-category-delete]'):null;
    if(!(button instanceof HTMLButtonElement))return;
    const name=button.dataset.shoppingCategoryDelete||'';
    if(!name)return;
    button.disabled=true;
    setStatus('更新しています…');
    try{
      const response=await fetch('/api/shopping-categories',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'disable',name,csrf:payload.csrf||''}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'カテゴリを削除できませんでした。');
      button.closest('[data-shopping-category-row]')?.remove();
      if(!list.querySelector('[data-shopping-category-row]'))list.innerHTML='<p class="empty">選択可能なカテゴリはありません。</p>';
      setStatus(`「${name}」を今後の候補から削除しました。`);
    }catch(error){
      button.disabled=false;
      setStatus(error instanceof Error?error.message:'カテゴリを削除できませんでした。',true);
    }
  });
})();
