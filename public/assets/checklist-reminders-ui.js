(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;
page.classList.add('reminders-ui');

if(!document.getElementById('remindersQuickEntryStyle')){
  const style=document.createElement('style');
  style.id='remindersQuickEntryStyle';
  style.textContent=`
  .reminders-quick-entry{margin:0 0 12px;background:#fff;border-radius:14px;box-shadow:0 0 0 .5px rgba(60,60,67,.15);overflow:hidden}
  .reminders-quick-entry-row{display:flex;align-items:center;gap:10px;min-height:54px;padding:6px 8px 6px 14px}
  .reminders-empty-check{flex:0 0 23px;width:23px;height:23px;border:1.7px solid #c7c7cc;border-radius:50%;box-sizing:border-box}
  .reminders-quick-input{flex:1;min-width:0;height:42px;border:0!important;outline:0!important;background:transparent!important;padding:0!important;box-shadow:none!important;font:inherit;font-size:16px!important;color:#1c1c1e}
  .reminders-quick-input::placeholder{color:#8e8e93}
  .reminders-save-button{flex:0 0 auto;min-width:54px;height:36px;border:0;border-radius:10px;background:#007aff;color:#fff;font-size:14px;font-weight:700;padding:0 12px}
  .reminders-save-button:disabled{background:#d1d1d6;color:#8e8e93}
  .reminders-quick-status{min-height:0;padding:0 14px;color:#8e8e93;font-size:12px;line-height:1.3}
  .reminders-quick-status:not(:empty){padding-bottom:8px}
  .reminders-inline-title{cursor:text;border-radius:6px;min-width:30px}
  .reminders-inline-title[data-inline-editing="1"]{outline:2px solid rgba(0,122,255,.28);background:#fff;padding:2px 4px;margin:-2px -4px;cursor:text;-webkit-user-select:text;user-select:text}
  .reminders-inline-title[data-inline-saving="1"]{opacity:.55}
  @media(min-width:821px){.reminders-quick-entry{max-width:100%;border:1px solid #e5e7eb;box-shadow:none}}
  `;
  document.head.appendChild(style);
}

const q=(selector,root=page)=>root.querySelector(selector);
const qa=(selector,root=page)=>[...root.querySelectorAll(selector)];
const count=(selector,root=page)=>qa(selector,root).length;
const payload=(()=>{try{return JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');}catch{return {};}})();
const selectedDate=(()=>{
  const raw=new URLSearchParams(location.search).get('date');
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(raw||'')))return String(raw);
  const compact=String(q('.checklist-date')?.textContent||'').trim();
  const match=compact.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
})();

// Presentation ownership belongs to the server-rendered/current checklist hierarchy.
// This asset now retains only inline-title behavior; it must not create transient
// Reminders quick-entry, smart-card, section-icon, or FAB presentation during boot.

const inlineTitleSelector='.task-main>span,.shopping-check-row>span,.item-check-row>span,.expired-task-main>span';
const editableTypes=new Set(['task','shopping','item','recurrence']);
const resolveInlineTarget=title=>{
  const row=title.closest('.row,.expired-row,.linked-shopping-row,.task-row');
  if(!row)return null;
  const toggle=row.querySelector('.toggle[data-type][data-id]');
  if(!(toggle instanceof HTMLInputElement))return null;
  const type=String(toggle.dataset.type||'');
  const id=Number(toggle.dataset.id||0);
  if(!editableTypes.has(type)||!Number.isInteger(id)||id<=0)return null;
  return {type,id};
};
const finishInlineEdit=async(title,cancel=false)=>{
  if(!(title instanceof HTMLElement)||title.dataset.inlineEditing!=='1'||title.dataset.inlineSaving==='1')return;
  const original=String(title.dataset.inlineOriginal||'');
  const next=String(title.textContent||'').replace(/\s+/g,' ').trim();
  if(cancel||!next||next===original){
    title.textContent=original;
    delete title.dataset.inlineEditing;delete title.dataset.inlineOriginal;
    title.contentEditable='false';
    return;
  }
  const target=resolveInlineTarget(title);
  if(!target){title.textContent=original;delete title.dataset.inlineEditing;delete title.dataset.inlineOriginal;title.contentEditable='false';return;}
  title.dataset.inlineSaving='1';title.contentEditable='false';
  try{
    const response=await fetch('/api/checklist/inline-title',{
      method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({csrf:String(payload.csrf||''),type:target.type,id:target.id,title:next}),
    });
    const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
    if(!response.ok||!data.ok)throw new Error(data.error||'更新に失敗しました。');
    title.textContent=String(data.title||next);
    delete title.dataset.inlineEditing;delete title.dataset.inlineOriginal;delete title.dataset.inlineSaving;
  }catch(error){
    title.textContent=original;
    delete title.dataset.inlineEditing;delete title.dataset.inlineOriginal;delete title.dataset.inlineSaving;
    alert(error?.message||String(error)||'更新に失敗しました。');
  }
};
for(const title of qa(inlineTitleSelector)){
  if(!(title instanceof HTMLElement)||!resolveInlineTarget(title))continue;
  title.classList.add('reminders-inline-title');
  title.title='タップして編集';
  title.addEventListener('click',event=>{
    event.stopPropagation();
    if(title.dataset.inlineEditing==='1')return;
    title.dataset.inlineOriginal=String(title.textContent||'').trim();
    title.dataset.inlineEditing='1';
    title.contentEditable='true';
    title.setAttribute('role','textbox');
    title.setAttribute('aria-label','項目名を編集');
    title.focus();
    const selection=window.getSelection();
    const range=document.createRange();
    range.selectNodeContents(title);range.collapse(false);
    selection?.removeAllRanges();selection?.addRange(range);
  });
  title.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();title.blur();
    }else if(event.key==='Escape'){
      event.preventDefault();finishInlineEdit(title,true);
    }
  });
  title.addEventListener('blur',()=>{void finishInlineEdit(title,false);});
}

})();
