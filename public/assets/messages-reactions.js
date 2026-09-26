(()=>{
  const chat=document.getElementById('chatMessages');if(!chat)return;
  const payload=JSON.parse(document.getElementById('messagesChatPayload')?.textContent||'{}');
  const csrf=String(payload.csrf||'');let emojis=[],busy=false,timer=0;
  const rows=()=>[...chat.querySelectorAll('.chat-message[data-message-id]')].slice(0,40);
  const render=(row,reactions)=>{
    let wrap=row.querySelector('.chat-reactions');if(!wrap){wrap=document.createElement('div');wrap.className='chat-reactions';row.querySelector('.chat-stack')?.append(wrap);}
    wrap.replaceChildren();
    for(const reaction of reactions){const button=document.createElement('button');button.type='button';button.className='chat-reaction-chip';if(reaction.mine)button.classList.add('mine');button.dataset.emoji=String(reaction.emoji);button.textContent=`${reaction.emoji} ${reaction.count}`;button.setAttribute('aria-label',`${reaction.emoji} ${reaction.count}件${reaction.mine?'、自分もリアクション済み':''}`);wrap.append(button);}
    const add=document.createElement('button');add.type='button';add.className='chat-reaction-add';add.textContent='＋';add.setAttribute('aria-label','リアクションを追加');wrap.append(add);
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
    const button=event.target.closest('.chat-reaction-chip,.chat-reaction-add,.chat-reaction-choice');if(!button||busy)return;
    const row=button.closest('.chat-message'),wrap=button.closest('.chat-reactions');if(!row||!wrap)return;
    if(button.classList.contains('chat-reaction-add')){wrap.querySelector('.chat-reaction-picker')?.remove();const picker=document.createElement('div');picker.className='chat-reaction-picker';for(const emoji of emojis){const choice=document.createElement('button');choice.type='button';choice.className='chat-reaction-choice';choice.dataset.emoji=emoji;choice.textContent=emoji;choice.setAttribute('aria-label',`${emoji}でリアクション`);picker.append(choice);}wrap.append(picker);return;}
    const emoji=String(button.dataset.emoji||'');if(!emojis.includes(emoji)&&!button.classList.contains('mine'))return;
    busy=true;button.disabled=true;
    try{const response=await fetch('/api/message-reactions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,messageId:Number(row.dataset.messageId),emoji})});if(response.ok)await refresh([row]);}
    catch{}finally{busy=false;button.disabled=false;}
  });
  new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&node.matches?.('.chat-message'))))schedule();}).observe(chat,{childList:true});
  schedule();
})();
