(()=>{
'use strict';
let dialog=null,actionMenu=null,operation=0,suppressRow=null,suppressUntil=0;
const csrf=()=>{for(const id of ['messagesChatPayload','familyLogPayload','mitenyaSharePayload']){try{const value=JSON.parse(document.getElementById(id)?.textContent||'{}').csrf;if(value)return String(value);}catch{}}return '';};
function open(kind,id,opener){
 if(dialog?.open)return;
 const generation=++operation,session=csrf(),d=document.createElement('dialog');dialog=d;
 d.setAttribute('aria-labelledby','mitenyaShareHeading');d.style.cssText='width:min(90vw,440px);max-height:85dvh;overflow:auto;border:0;border-radius:16px;padding:20px';
 const heading=document.createElement('h2');heading.id='mitenyaShareHeading';heading.textContent='みてにゃに写真を追加';
 const note=document.createElement('p');note.textContent='この写真のコピーを渡します。みてにゃの確認画面で、子ども・公開範囲・ひとことを確認してから投稿します。元の写真は残ります。';
 const label=document.createElement('label');label.textContent='ひとこと（共有する内容だけ入力・任意）';
 const caption=document.createElement('textarea');caption.maxLength=2000;caption.rows=3;caption.style.width='100%';label.append(caption);
 const status=document.createElement('p');status.setAttribute('role','status');
 const next=document.createElement('button');next.type='button';next.textContent='写真の受け渡しを準備';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='閉じる';cancel.onclick=()=>d.close();
 for(const b of [next,cancel])b.style.cssText='min-height:44px;margin:8px 8px 0 0';
 d.append(heading,note,label,status,next,cancel);document.body.append(d);
 d.addEventListener('close',()=>{operation++;d.remove();if(dialog===d)dialog=null;opener?.focus?.();},{once:true});
 d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
 next.onclick=async()=>{
  next.disabled=true;caption.disabled=true;status.textContent='写真を確認中…';
  try{
   if(!session||csrf()!==session)throw Error('ログイン状態が変わりました。画面を開き直してください。');
   const response=await fetch('/api/messages?photo_transfer=1',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':session},body:JSON.stringify({kind,id,caption:caption.value})});
   const data=await response.json();
   if(generation!==operation||!d.open)return;
   if(csrf()!==session)throw Error('ログイン状態が変わりました。画面を開き直してください。');
   if(!response.ok||!data.ok)throw Error(data.error||'準備できませんでした。');
   const url=new URL(data.url);if(url.origin!=='https://mitenya.marinski1112.workers.dev'||url.pathname!=='/'||!/^#import-photo=[a-f0-9]{64}$/.test(url.hash))throw Error('受け渡し先を確認できませんでした。');
   const link=document.createElement('a');link.href=url.href;link.rel='noreferrer';link.textContent='みてにゃで投稿内容を確認';link.className='btn';link.style.minHeight='44px';
   next.replaceWith(link);status.textContent='5分以内に開いてください。まだ投稿されていません。';link.focus();
  }catch(error){if(generation!==operation)return;status.textContent=error instanceof Error?error.message:'準備できませんでした。';next.disabled=false;caption.disabled=false;}
 };
 d.showModal();caption.focus();
}
window.openMitenyaPhotoShare=open;

function closeActionMenu(){if(!actionMenu)return;const menu=actionMenu;actionMenu=null;if(menu.open)menu.close();else menu.remove();}
function openJournalMenu(row,id,opener){
 closeActionMenu();
 const d=document.createElement('dialog');actionMenu=d;d.setAttribute('aria-label','写真の操作');
 d.style.cssText='width:min(92vw,360px);border:0;border-radius:16px;padding:10px;box-shadow:0 16px 48px rgba(0,0,0,.28)';
 const share=document.createElement('button');share.type='button';share.textContent='みてにゃへ';share.style.cssText='width:100%;min-height:48px;text-align:left;padding:10px 14px';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='キャンセル';cancel.style.cssText='width:100%;min-height:48px;margin-top:4px';
 share.addEventListener('click',()=>{d.close();open('journal',id,opener||row);});cancel.addEventListener('click',()=>d.close());
 d.addEventListener('close',()=>{if(actionMenu===d)actionMenu=null;d.remove();},{once:true});
 d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
 d.append(share,cancel);document.body.append(d);d.showModal();share.focus();
}
function journalTarget(target){
 if(!(target instanceof Element))return null;
 const image=target.closest('[data-mitenya-log] img');if(!image)return null;
 const row=image.closest('[data-mitenya-log]'),id=Number(row?.getAttribute('data-mitenya-log'));return row&&Number.isSafeInteger(id)&&id>0?{row,id,image}:null;
}
let pressTimer=0,pressX=0,pressY=0,pressRow=null;
const stopPress=()=>{if(pressTimer)clearTimeout(pressTimer);pressTimer=0;pressRow=null;};
document.addEventListener('pointerdown',e=>{
 const target=journalTarget(e.target);if(!target||e.button!==0)return;
 stopPress();pressX=e.clientX;pressY=e.clientY;pressRow=target.row;
 pressTimer=setTimeout(()=>{pressTimer=0;suppressRow=target.row;suppressUntil=Date.now()+1200;navigator.vibrate?.(20);openJournalMenu(target.row,target.id,target.image);},600);
});
document.addEventListener('pointermove',e=>{if(pressTimer&&Math.hypot(e.clientX-pressX,e.clientY-pressY)>10)stopPress();},{passive:true});
for(const name of ['pointerup','pointercancel'])document.addEventListener(name,stopPress,{passive:true});
document.addEventListener('click',e=>{if(Date.now()<suppressUntil&&suppressRow&&e.target instanceof Node&&suppressRow.contains(e.target)){suppressUntil=0;suppressRow=null;e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('contextmenu',e=>{const target=journalTarget(e.target);if(!target)return;e.preventDefault();openJournalMenu(target.row,target.id,target.image);});
document.addEventListener('keydown',e=>{
 if(!(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')))return;
 const focused=document.activeElement;if(!(focused instanceof Element))return;
 const row=focused.closest('[data-mitenya-log]');if(!row)return;const id=Number(row.getAttribute('data-mitenya-log'));if(!Number.isSafeInteger(id)||id<1)return;
 e.preventDefault();openJournalMenu(row,id,focused);
});
window.addEventListener('pagehide',()=>{stopPress();closeActionMenu();if(dialog?.open)dialog.close();},{once:true});
})();
