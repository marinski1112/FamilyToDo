(()=>{
'use strict';
const form=document.getElementById('messageNew');
if(!(form instanceof HTMLFormElement))return;
const textarea=form.querySelector('textarea[name="text"]');
let selectedStampId=0,loaded=false;

const sameOriginUrl=value=>{try{const url=new URL(String(value||''),location.origin);return url.origin===location.origin?url.href:null;}catch{return null;}};
const style=document.createElement('style');
style.textContent='.message-stamp-picker{margin:10px 0}.message-stamp-options{display:none;gap:8px;flex-wrap:wrap;margin-top:8px}.message-stamp-options.open{display:flex}.message-stamp-option{width:64px;height:64px;border:1px solid #ddd;border-radius:12px;background:#fff;padding:4px;display:grid;place-items:center}.message-stamp-option.selected{outline:3px solid currentColor}.message-stamp-option img{max-width:54px;max-height:54px;object-fit:contain}.message-stamp-selected{font-size:.9rem;margin-top:6px}';
document.head.appendChild(style);

const wrap=document.createElement('div');wrap.className='message-stamp-picker';
const toggle=document.createElement('button');toggle.type='button';toggle.className='btn gray small';toggle.textContent='スタンプを追加';
const options=document.createElement('div');options.className='message-stamp-options';options.setAttribute('aria-label','スタンプ候補');
const selected=document.createElement('div');selected.className='message-stamp-selected';
const clear=document.createElement('button');clear.type='button';clear.className='btn gray small';clear.textContent='スタンプを外す';clear.hidden=true;
wrap.append(toggle,options,selected,clear);
if(textarea)textarea.insertAdjacentElement('afterend',wrap);else form.appendChild(wrap);

const syncRequired=()=>{if(textarea)textarea.required=selectedStampId<=0;clear.hidden=selectedStampId<=0;if(selectedStampId<=0)selected.textContent='';};
clear.addEventListener('click',()=>{selectedStampId=0;options.querySelectorAll('.message-stamp-option').forEach(button=>button.classList.remove('selected'));syncRequired();});

const loadOptions=async()=>{
  if(loaded)return;loaded=true;options.textContent='読み込み中…';
  try{
    const response=await fetch('/api/calendar-stamp-options',{credentials:'same-origin'});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok||!Array.isArray(payload.options))throw new Error('load failed');
    options.textContent='';
    for(const option of payload.options){
      const id=Number(option?.id||0),thumbnail=sameOriginUrl(option?.thumbnailUrl);if(!Number.isSafeInteger(id)||id<=0||!thumbnail)continue;
      const button=document.createElement('button');button.type='button';button.className='message-stamp-option';button.title=String(option?.name||'スタンプ');
      const image=document.createElement('img');image.src=thumbnail;image.alt=button.title;button.appendChild(image);
      button.addEventListener('click',()=>{selectedStampId=id;options.querySelectorAll('.message-stamp-option').forEach(entry=>entry.classList.remove('selected'));button.classList.add('selected');selected.textContent=`選択中：${button.title}`;syncRequired();});
      options.appendChild(button);
    }
    if(!options.children.length)options.textContent='利用できるスタンプはありません。';
  }catch{options.textContent='スタンプ候補を読み込めませんでした。';}
};
toggle.addEventListener('click',async()=>{await loadOptions();options.classList.toggle('open');});

form.onsubmit=async e=>{
  e.preventDefault();
  try{
    const b=Object.fromEntries(new FormData(e.currentTarget));
    const endpoint=selectedStampId>0?'/api/message-stamps':'/api/messages';
    if(selectedStampId>0)b.assetId=selectedStampId;
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)throw new Error('投稿できませんでした。');
    location.href='/app/messages.php';
  }catch{alert('投稿できませんでした。');}
};
syncRequired();
})();
