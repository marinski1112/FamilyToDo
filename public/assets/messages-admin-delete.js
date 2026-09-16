(()=>{
'use strict';
if(location.pathname!=='/app/messages.php')return;
const payload=JSON.parse(document.getElementById('messagesChatPayload')?.textContent||'{}');
if(payload.canModerate!==true)return;
const menu=document.getElementById('chatMenu'),backdrop=document.getElementById('chatMenuBackdrop');
if(!menu||!backdrop)return;
let activeRow=null;
document.getElementById('chatMessages')?.addEventListener('pointerdown',event=>{
  const row=event.target instanceof Element?event.target.closest('.chat-message'):null;
  if(row)activeRow=row;
},{passive:true});
const remove=async()=>{
  if(!activeRow||!confirm('管理者としてこのメッセージを削除しますか？'))return;
  const csrf=String(payload.csrf||''),id=Number(activeRow.dataset.messageId||0);
  if(!id)return;
  try{
    const response=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'delete',id,csrf})});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new Error(data?.error||'削除できませんでした。');
    activeRow.remove();
    backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');menu.textContent='';
  }catch(error){alert(error instanceof Error?error.message:'削除できませんでした。');}
};
const observer=new MutationObserver(()=>{
  if(!backdrop.classList.contains('open')||!activeRow||activeRow.dataset.mine==='1'||menu.querySelector('[data-admin-delete]'))return;
  const cancel=menu.querySelector('.chat-menu-cancel'),button=document.createElement('button');
  button.type='button';button.className='danger';button.dataset.adminDelete='1';button.textContent='管理者として削除';button.addEventListener('click',remove);
  menu.insertBefore(button,cancel||null);
});
observer.observe(menu,{childList:true});
})();
