(()=>{
  'use strict';
  const payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');
  const overdueShoppingMore=document.querySelector('.expired-shopping-more');
  if(!(overdueShoppingMore instanceof HTMLButtonElement))return;
  overdueShoppingMore.addEventListener('click',async()=>{
    const section=overdueShoppingMore.closest('details.expired-shopping');
    const list=section?.querySelector('.expired-shopping-list');
    const count=section?.querySelector('.expired-shopping-count');
    if(!(list instanceof HTMLElement)||overdueShoppingMore.disabled)return;
    overdueShoppingMore.disabled=true;
    overdueShoppingMore.textContent='読み込み中…';
    try{
      const query=new URLSearchParams({
        date:String(payload.date||''),
        overdue:'shopping',
        cursor_due:overdueShoppingMore.dataset.cursorDue||'',
        cursor_category_present:overdueShoppingMore.dataset.cursorCategoryPresent||'',
        cursor_category:overdueShoppingMore.dataset.cursorCategory||'',
        cursor_name:overdueShoppingMore.dataset.cursorName||'',
        cursor_id:overdueShoppingMore.dataset.cursorId||'',
      });
      const response=await fetch(`/app/tasks.php?${query}`,{credentials:'same-origin',headers:{accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error('overdue shopping page failed');
      list.insertAdjacentHTML('beforeend',String(data.html||''));
      const loaded=section?.querySelectorAll('[data-expired-shopping-id]').length||0;
      if(count)count.textContent=`${loaded}件表示${data.hasMore?'（続きあり）':''}`;
      if(data.hasMore&&data.cursor?.due&&Number(data.cursor?.id)>0){
        overdueShoppingMore.dataset.cursorDue=String(data.cursor.due);
        overdueShoppingMore.dataset.cursorCategoryPresent=String(data.cursor.categoryPresent??0);
        overdueShoppingMore.dataset.cursorCategory=String(data.cursor.category??'');
        overdueShoppingMore.dataset.cursorName=String(data.cursor.name??'');
        overdueShoppingMore.dataset.cursorId=String(data.cursor.id);
        overdueShoppingMore.disabled=false;
        overdueShoppingMore.textContent='続きを表示';
      }else overdueShoppingMore.remove();
    }catch{
      overdueShoppingMore.disabled=false;
      overdueShoppingMore.textContent='続きを表示';
      alert('期限切れ買い物の続きを読み込めませんでした。');
    }
  });
})();
