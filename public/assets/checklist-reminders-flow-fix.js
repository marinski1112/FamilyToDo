(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;

const payload=(()=>{try{return JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');}catch{return {};}})();
const titleSelector='.task-main>span,.shopping-check-row>span,.item-check-row>span,.expired-task-main>span';
const editableTypes=new Set(['task','shopping','item','recurrence']);
const selectedDate=(()=>{
  const raw=new URLSearchParams(location.search).get('date');
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(raw||'')))return String(raw);
  const compact=String(page.querySelector('.checklist-date')?.textContent||'').trim();
  const match=compact.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
})();

// Titles live inside <label>. Cancelling the label's default action is required on iOS;
// otherwise tapping text to edit also toggles the checkbox.
page.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest(titleSelector):null;
  if(target&&page.contains(target))event.preventDefault();
},true);

const resolveInlineTarget=title=>{
  const row=title.closest('.row,.expired-row,.linked-shopping-row');
  const checkbox=row?.querySelector('input.toggle[data-type][data-id]');
  if(!(checkbox instanceof HTMLInputElement))return null;
  const type=String(checkbox.dataset.type||'');
  let id=Number(checkbox.dataset.id||0);
  if(type==='recurrence')id=Math.abs(id);
  if(!editableTypes.has(type)||!Number.isInteger(id)||id<=0)return null;
  return {type,id};
};

const bindInlineEditor=title=>{
  if(!(title instanceof HTMLElement)||title.dataset.flowInlineBound==='1')return;
  const target=resolveInlineTarget(title);if(!target)return;
  title.dataset.flowInlineBound='1';
  title.classList.add('reminders-inline-title');
  title.title='タップして編集';
  const begin=()=>{
    if(title.dataset.inlineEditing==='1')return;
    title.dataset.inlineOriginal=String(title.textContent||'').trim();
    title.dataset.inlineEditing='1';
    title.contentEditable='true';
    title.setAttribute('role','textbox');
    title.setAttribute('aria-label','項目名を編集');
    title.focus();
    const selection=window.getSelection();const range=document.createRange();
    range.selectNodeContents(title);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range);
  };
  title.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();begin();});
  title.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Enter'){event.preventDefault();title.blur();}
    if(event.key==='Escape'){event.preventDefault();title.dataset.inlineCancel='1';title.textContent=title.dataset.inlineOriginal||'';title.blur();}
  });
  title.addEventListener('blur',async()=>{
    if(title.dataset.inlineEditing!=='1')return;
    title.contentEditable='false';title.removeAttribute('role');title.removeAttribute('aria-label');
    title.dataset.inlineEditing='0';
    if(title.dataset.inlineCancel==='1'){delete title.dataset.inlineCancel;return;}
    const original=String(title.dataset.inlineOriginal||'').trim();const next=String(title.textContent||'').trim();
    if(!next){title.textContent=original;return;}
    if(next===original)return;
    try{
      const response=await fetch('/api/checklist/inline-title',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),type:target.type,id:target.id,title:next})});
      const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
      if(!response.ok||!data.ok)throw new Error(data.error||'更新に失敗しました。');
      title.textContent=String(data.title||next);
    }catch(error){title.textContent=original;alert(error?.message||String(error));}
  });
};

const addTaskRow=(id,title)=>{
  const section=page.querySelector('.task-section');if(!(section instanceof HTMLElement))return;
  section.querySelector(':scope > .empty')?.remove();
  const row=document.createElement('div');row.className='row task-row reminders-new-row';
  row.innerHTML=`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${id}"><span></span></label><div class="checklist-row-actions"><a class="checklist-row-action" href="/task/view.php?id=${id}" aria-label="詳細">詳細</a><a class="task-shopping-add" href="/app/shopping_new.php?date=${encodeURIComponent(selectedDate)}&task_id=${id}" aria-label="この予定に買い物を追加" title="買い物を追加"><span aria-hidden="true">🛒</span><span class="shopping-plus-badge" aria-hidden="true">＋</span></a></div></div><div class="meta"></div>`;
  const titleNode=row.querySelector('.task-main>span');if(titleNode)titleNode.textContent=title;
  const completed=section.querySelector(':scope > details.completed-tasks');
  if(completed)section.insertBefore(row,completed);else section.append(row);
  if(titleNode)bindInlineEditor(titleNode);
  const count=section.querySelectorAll(':scope > .task-row').length;
  const smartCount=page.querySelector('.reminders-smart-card[data-tone="blue"] .reminders-smart-count');
  if(smartCount)smartCount.textContent=String(count);
  row.scrollIntoView({block:'nearest'});
};

// Existing titles already have the original editor bound. New rows are bound here.
page.querySelectorAll(titleSelector).forEach(title=>{if(title instanceof HTMLElement)title.classList.add('reminders-inline-title');});

const form=page.querySelector('.reminders-quick-entry');
const input=form?.querySelector('.reminders-quick-input');
const save=form?.querySelector('.reminders-save-button');
const status=form?.querySelector('.reminders-quick-status');
if(form instanceof HTMLFormElement&&input instanceof HTMLInputElement){
  input.setAttribute('enterkeyhint','next');
  input.placeholder='新しい項目を入力して改行';
  if(save instanceof HTMLButtonElement){save.textContent='追加';save.setAttribute('aria-label','項目を追加');}
  let saving=false;
  const sync=()=>{if(save instanceof HTMLButtonElement)save.disabled=saving||!input.value.trim();};
  const submitQuick=async()=>{
    const title=input.value.trim();if(!title||saving)return;
    saving=true;sync();if(status instanceof HTMLElement)status.textContent='';
    try{
      const response=await fetch('/api/task',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),title,dateOnly:selectedDate,endDateOnly:selectedDate,is_event:false,noDate:false,allDay:true,calendar_visible:true})});
      const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
      if(!response.ok||!data.ok)throw new Error(data.error||'保存に失敗しました。');
      addTaskRow(Number(data.id),title);
      input.value='';
      if(status instanceof HTMLElement)status.textContent='';
    }catch(error){if(status instanceof HTMLElement)status.textContent=error?.message||String(error)||'保存に失敗しました。';}
    finally{saving=false;sync();requestAnimationFrame(()=>input.focus({preventScroll:true}));}
  };
  input.addEventListener('input',sync);
  input.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Enter'){
      event.preventDefault();event.stopImmediatePropagation();void submitQuick();
    }
  },true);
  // Own all form submits (including the fallback Add button) before the older handler can reload the page.
  document.addEventListener('submit',event=>{
    if(event.target!==form)return;
    event.preventDefault();event.stopPropagation();void submitQuick();
  },true);
  sync();
}
})();
