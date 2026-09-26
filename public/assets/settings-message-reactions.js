(()=>{
  const form=document.getElementById('messageReactionSettings');if(!form)return;
  const input=document.getElementById('messageReactionEmojis'),status=document.getElementById('messageReactionStatus');
  const csrf=String(JSON.parse(document.getElementById('settingsPayload')?.textContent||'{}').csrf||'');
  fetch('/api/message-reactions',{credentials:'same-origin',cache:'no-store'})
    .then(r=>r.json()).then(data=>{if(data?.ok&&Array.isArray(data.emojis))input.value=data.emojis.join(', ');})
    .catch(()=>{status.textContent='リアクションを読み込めませんでした。';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const emojis=String(input.value||'').split(/[,、\n]+/u).map(v=>v.trim()).filter(Boolean);
    if(emojis.length<1||emojis.length>20||emojis.some(v=>Array.from(v).length>32)||new Set(emojis).size!==emojis.length){status.textContent='1〜20個の重複しない絵文字を入力してください。';return;}
    status.textContent='保存中…';
    try{const response=await fetch('/api/message-reactions',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,emojis})});const data=await response.json();status.textContent=response.ok&&data?.ok?'保存しました。':'保存できませんでした。';}
    catch{status.textContent='保存できませんでした。';}
  });
})();
