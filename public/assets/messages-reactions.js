(()=>{
  const chat=document.getElementById('chatMessages'),menu=document.getElementById('chatMenu'),backdrop=document.getElementById('chatMenuBackdrop');if(!chat||!menu||!backdrop)return;
  const payload=JSON.parse(document.getElementById('messagesChatPayload')?.textContent||'{}');
  const csrf=String(payload.csrf||'');let emojis=[],busy=false,timer=0;
  const rows=()=>[...chat.querySelectorAll('.chat-message[data-message-id]')].slice(0,40);
  const render=(row,reactions)=>{
    let wrap=row.querySelector('.chat-reactions');if(!reactions.length){wrap?.remove();return;}if(!wrap){wrap=document.createElement('div');wrap.className='chat-reactions';row.querySelector('.chat-stack')?.append(wrap);}
    wrap.replaceChildren();
    for(const reaction of reactions){const button=document.createElement('button');button.type='button';button.className='chat-reaction-chip';if(reaction.mine)button.classList.add('mine');button.dataset.emoji=String(reaction.emoji);button.textContent=`${reaction.emoji} ${reaction.count}`;button.setAttribute('aria-label',`${reaction.emoji} ${reaction.count}件${reaction.mine?'、自分もリアクション済み':''}`);wrap.append(button);}
  };
  async function refresh(targetRows){
    const ids=targetRows.map(row=>Number(row.dataset.messageId)).filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,40);if(!ids.length)return;
    const response=await fetch(`/api/message-reactions?ids=${ids.join(',')}`,{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();if(!response.ok||!data?.ok)return;
    emojis=Array.isArray(data.emojis)?data.emojis:[];
    const byId=new Map();for(const reaction of data.reactions||[]){const id=Number(reaction.messageId);if(!byId.has(id))byId.set(id,[]);byId.get(id).push(reaction);}
    for(const row of targetRows)if(row.isConnected)render(row,byId.get(Number(row.dataset.messageId))||[]);
  }
  function schedule(){if(timer)return;timer=setTimeout(()=>{timer=0;refresh(rows()).catch(()=>{});},120);}
  chat.addEventListener('click',async event=>{
    const button=event.target.closest('.chat-reaction-chip');if(!button||busy)return;
    const row=button.closest('.chat-message');if(!row)return;
    const emoji=String(button.dataset.emoji||'');if(!emojis.includes(emoji)&&!button.classList.contains('mine'))return;
    busy=true;button.disabled=true;
    try{const response=await fetch('/api/message-reactions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,messageId:Number(row.dataset.messageId),emoji})});if(response.ok)await refresh([row]);}
    catch{}finally{busy=false;button.disabled=false;}
  });
  backdrop.addEventListener('message-chat-menu-open',event=>{
    const row=event.detail?.row;if(!row?.isConnected)return;
    const button=document.createElement('button');button.type='button';button.textContent='リアクション';button.setAttribute('aria-expanded','false');
    const picker=document.createElement('div');picker.className='chat-menu-reaction-picker';picker.hidden=true;
    button.addEventListener('click',async()=>{
      if(!picker.hidden){picker.hidden=true;button.setAttribute('aria-expanded','false');return;}
      button.disabled=true;
      try{await refresh([row]);}catch{}finally{button.disabled=false;}
      if(!backdrop.classList.contains('open')||!button.isConnected)return;
      picker.replaceChildren();
      if(!emojis.length){const empty=document.createElement('span');empty.textContent='リアクションは未設定です';picker.append(empty);}
      for(const emoji of emojis){const choice=document.createElement('button');choice.type='button';choice.textContent=emoji;choice.setAttribute('aria-label',`${emoji}でリアクション`);choice.addEventListener('click',async()=>{
        if(busy)return;busy=true;choice.disabled=true;
        try{const response=await fetch('/api/message-reactions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,messageId:Number(row.dataset.messageId),emoji})});if(!response.ok)throw new Error('リアクションできませんでした。');menu.querySelector('.chat-menu-cancel')?.click();refresh([row]).catch(()=>{});}
        catch{alert('リアクションできませんでした。');}finally{busy=false;choice.disabled=false;}
      });picker.append(choice);}
      picker.hidden=false;button.setAttribute('aria-expanded','true');
    });
    menu.insertBefore(button,menu.querySelector('.chat-menu-cancel'));
    menu.insertBefore(picker,menu.querySelector('.chat-menu-cancel'));
  });
  new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&node.matches?.('.chat-message'))))schedule();}).observe(chat,{childList:true});
  setInterval(()=>{if(!document.hidden)schedule();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  schedule();
})();
