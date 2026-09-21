(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;
page.classList.add('reminders-ui');

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
