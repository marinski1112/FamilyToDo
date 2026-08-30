(()=>{
'use strict';
document.getElementById('messageNew').onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'投稿できませんでした。');location.href='/app/messages.php';}catch(err){alert(err instanceof Error&&err.message?err.message:'投稿できませんでした。');}};
})();
