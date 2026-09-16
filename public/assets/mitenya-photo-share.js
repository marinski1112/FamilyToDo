(()=>{
'use strict';
let dialog=null,operation=0;
const csrf=()=>{for(const id of ['messagesChatPayload','familyLogPayload','mitenyaSharePayload']){try{const value=JSON.parse(document.getElementById(id)?.textContent||'{}').csrf;if(value)return String(value);}catch{}}return '';};
function open(kind,id,opener){
 if(dialog?.open)return;
 const generation=++operation,session=csrf(),d=document.createElement('dialog');dialog=d;
 d.setAttribute('aria-labelledby','mitenyaShareHeading');d.style.cssText='width:min(90vw,440px);max-height:85dvh;overflow:auto;border:0;border-radius:16px;padding:20px';
 const heading=document.createElement('h2');heading.id='mitenyaShareHeading';heading.textContent='みてにゃに写真を追加';
 const note=document.createElement('p');note.textContent='この写真のコピーを渡します。みてにゃで管理者ログイン後、子ども・公開範囲を確認して投稿します。元の写真は残ります。';
 const label=document.createElement('label');label.textContent='ひとこと（共有する内容だけ入力・任意）';
 const caption=document.createElement('textarea');caption.maxLength=2000;caption.rows=3;caption.style.width='100%';label.append(caption);
 const status=document.createElement('p');status.setAttribute('role','status');
 const next=document.createElement('button');next.type='button';next.textContent='写真の受け渡しを準備';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='閉じる';cancel.onclick=()=>d.close();
 for(const b of [next,cancel])b.style.cssText='min-height:44px;margin:8px 8px 0 0';
 d.append(heading,note,label,status,next,cancel);document.body.append(d);
 d.addEventListener('close',()=>{operation++;d.remove();if(dialog===d)dialog=null;opener?.focus();},{once:true});
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
for(const row of document.querySelectorAll('[data-mitenya-log],.chat-message[data-message-type="image"]')){
 const journal=row.hasAttribute('data-mitenya-log'),id=Number(journal?row.dataset.mitenyaLog:row.dataset.messageId);if(!Number.isSafeInteger(id)||id<1)continue;
 const button=document.createElement('button');button.type='button';button.textContent='みてにゃへ';button.dataset.photoShare='1';button.setAttribute('aria-label','この写真をみてにゃに追加');button.style.cssText='min-width:44px;min-height:44px';button.onclick=()=>open(journal?'journal':'message',id,button);row.append(button);
 if(!journal)continue;
 let timer=0,x=0,y=0,suppressUntil=0;
 const stop=()=>{clearTimeout(timer);timer=0;};
 row.addEventListener('pointerdown',e=>{if(e.button!==0)return;const control=e.target.closest('button,input,textarea');if(control&&!control.hasAttribute('data-journal-photo'))return;x=e.clientX;y=e.clientY;timer=setTimeout(()=>{timer=0;suppressUntil=Date.now()+1200;open('journal',id,button);},600);});
 row.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x,e.clientY-y)>10)stop();});
 for(const name of ['pointerup','pointercancel','pointerleave'])row.addEventListener(name,stop);
 row.addEventListener('click',e=>{if(Date.now()<suppressUntil){suppressUntil=0;e.preventDefault();e.stopImmediatePropagation();}},true);
}
})();
