(()=>{
'use strict';
if(location.pathname!=='/app/messages.php')return;
const script=document.currentScript;
if(script?.dataset.canDeleteAny!=='1')return;
const payload=JSON.parse(document.getElementById('messagesChatPayload')?.textContent||'{}');
const csrf=String(payload.csrf||'');
const backdrop=document.getElementById('chatMenuBackdrop'),menu=document.getElementById('chatMenu'),messages=document.getElementById('chatMessages');
if(!backdrop||!menu||!messages)return;
let activeRow=null;
messages.addEventListener('pointerdown',e=>{const row=e.target.closest?.('.chat-message');if(row)activeRow=row;},{capture:true,passive:true});
const addAdminDelete=()=>{
  if(!backdrop.classList.contains('open')||!activeRow||activeRow.dataset.mine==='1'||menu.querySelector('[data-admin-message-delete]'))return;
  const button=document.createElement('button');
  button.type='button';button.className='danger';button.dataset.adminMessageDelete='1';button.textContent='管理者として削除';
  button.addEventListener('click',async()=>{
    if(!confirm('この家族メンバーの投稿を削除しますか？'))return;
    button.disabled=true;
    try{
      const response=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'delete',id:Number(activeRow.dataset.messageId),csrf})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||'削除できませんでした。');
      activeRow.remove();backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');menu.textContent='';activeRow=null;
    }catch(error){button.disabled=false;alert(error instanceof Error?error.message:'削除できませんでした。');}
  });
  menu.prepend(button);
};
new MutationObserver(addAdminDelete).observe(backdrop,{attributes:true,attributeFilter:['class']});
})();
