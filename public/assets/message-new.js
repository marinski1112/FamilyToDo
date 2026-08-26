(()=>{
'use strict';
document.getElementById('messageNew').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/app/messages.php';else alert(d.error||'投稿できませんでした。');};
})();
