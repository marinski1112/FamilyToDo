(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;

const payload=(()=>{try{return JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');}catch{return {};}})();
const selectedDate=(()=>{
  const raw=new URLSearchParams(location.search).get('date');
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(raw||'')))return String(raw);
  const compact=String(page.querySelector('.checklist-date')?.textContent||'').trim();
  const match=compact.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
})();

if(!document.getElementById('sectionQuickEntryStyle')){
  const style=document.createElement('style');style.id='sectionQuickEntryStyle';style.textContent=`
  .section-quick-entry{margin:2px 0 8px;border-top:1px solid #eef0f3;border-bottom:1px solid #eef0f3}
  .section-quick-row{display:flex;align-items:center;gap:10px;min-height:48px;padding:2px 0}
  .section-quick-circle{width:22px;height:22px;flex:0 0 22px;border:1.7px solid #c7c7cc;border-radius:50%;box-sizing:border-box}
  .section-quick-input{min-width:0;flex:1;height:42px;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;font:inherit;font-size:16px!important;color:#1c1c1e}
  .section-quick-input::placeholder{color:#8e8e93}
  .shopping-quick-category-row{display:flex;align-items:center;gap:8px;padding:4px 0 0 32px}
  .shopping-quick-category-label{font-size:12px;font-weight:700;color:#64748b;white-space:nowrap}
  .shopping-quick-category{height:34px!important;font-size:14px!important;border:0!important;border-bottom:1px solid #e5e7eb!important;border-radius:0!important;padding:0 2px!important;background:transparent!important;box-shadow:none!important}
  .section-quick-status{min-height:0;font-size:12px;line-height:1.3;color:#64748b;padding:0 0 0 32px}
  .section-quick-status:not(:empty){padding-bottom:6px}
  .shopping-category-group{margin:8px 0 12px}
  .shopping-category-title{font-size:13px;font-weight:800;color:#475569;padding:4px 2px 5px;border-bottom:1px solid #e5e7eb}
  .shopping-category-group>.linked-shopping-row{margin-left:8px}
  `;document.head.append(style);
}

const titleSelector='.task-main>span,.shopping-check-row>span,.item-section .row label>span,.expired-task-main>span';
const editableTypes=new Set(['task','shopping','item','recurrence']);

// Titles are nested inside <label>; without this capture guard iOS treats text taps as
// checkbox taps too.
page.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest(titleSelector):null;
  if(target&&page.contains(target))event.preventDefault();
},true);

const resolveInlineTarget=title=>{
  const row=title.closest('.row,.expired-row,.linked-shopping-row');
  const checkbox=row?.querySelector('input.toggle[data-type][data-id]');
  if(!(checkbox instanceof HTMLInputElement))return null;
  const type=String(checkbox.dataset.type||'');
  let id=Number(checkbox.dataset.id||0);if(type==='recurrence')id=Math.abs(id);
  if(!editableTypes.has(type)||!Number.isInteger(id)||id<=0)return null;
  return {type,id};
};
const bindInlineEditor=title=>{
  if(!(title instanceof HTMLElement)||title.dataset.flowInlineBound==='1')return;
  const target=resolveInlineTarget(title);if(!target)return;
  title.dataset.flowInlineBound='1';title.classList.add('reminders-inline-title');title.title='タップして編集';
  const begin=()=>{
    if(title.dataset.inlineEditing==='1')return;
    title.dataset.inlineOriginal=String(title.textContent||'').trim();title.dataset.inlineEditing='1';title.contentEditable='true';
    title.setAttribute('role','textbox');title.setAttribute('aria-label','項目名を編集');title.focus();
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(title);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range);
  };
  title.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();begin();});
  title.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Enter'){event.preventDefault();title.blur();}
    if(event.key==='Escape'){event.preventDefault();title.dataset.inlineCancel='1';title.textContent=title.dataset.inlineOriginal||'';title.blur();}
  });
  title.addEventListener('blur',async()=>{
    if(title.dataset.inlineEditing!=='1')return;
    title.contentEditable='false';title.removeAttribute('role');title.removeAttribute('aria-label');title.dataset.inlineEditing='0';
    if(title.dataset.inlineCancel==='1'){delete title.dataset.inlineCancel;return;}
    const original=String(title.dataset.inlineOriginal||'').trim(),next=String(title.textContent||'').replace(/\s+/g,' ').trim();
    if(!next){title.textContent=original;return;}if(next===original)return;
    try{
      const response=await fetch('/api/checklist/inline-title',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),type:target.type,id:target.id,title:next})});
      const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
      if(!response.ok||!data.ok)throw new Error(data.error||'更新に失敗しました。');title.textContent=String(data.title||next);
    }catch(error){title.textContent=original;alert(error?.message||String(error));}
  });
};
page.querySelectorAll(titleSelector).forEach(bindInlineEditor);

const clearEmpty=section=>section.querySelector(':scope > .empty')?.remove();

const addTaskRow=(id,title)=>{
  const section=page.querySelector('.task-section');if(!(section instanceof HTMLElement))return;
  clearEmpty(section);const row=document.createElement('div');row.className='row task-row reminders-new-row';
  row.innerHTML=`<div class="task-main-row"><label class="task-main"><input class="check toggle" type="checkbox" data-type="task" data-id="${id}"><span></span></label><div class="checklist-row-actions"><a class="checklist-row-action" href="/task/view.php?id=${id}" aria-label="詳細">詳細</a></div></div><div class="meta"></div>`;
  const titleNode=row.querySelector('.task-main>span');if(titleNode)titleNode.textContent=title;
  const form=section.querySelector(':scope > .section-quick-entry'),completed=section.querySelector(':scope > details.completed-tasks');
  if(completed)section.insertBefore(row,completed);else if(form)form.insertAdjacentElement('afterend',row);else section.append(row);
  if(titleNode)bindInlineEditor(titleNode);
};
const addItemRow=(id,name)=>{
  const section=page.querySelector('.item-section');if(!(section instanceof HTMLElement))return;
  clearEmpty(section);const row=document.createElement('div');row.className='row reminders-new-row';
  row.innerHTML=`<div style="display:flex;gap:10px;align-items:center"><label style="display:flex;gap:10px;align-items:center;min-width:0"><input class="check toggle" type="checkbox" data-type="item" data-id="${id}"><span></span></label><a href="/item/edit.php?id=${id}" aria-label="編集" style="margin-left:auto;white-space:nowrap">編集</a></div><div class="meta"></div>`;
  const titleNode=row.querySelector('label>span');if(titleNode)titleNode.textContent=name;
  const form=section.querySelector(':scope > .section-quick-entry');if(form)form.insertAdjacentElement('afterend',row);else section.append(row);
  if(titleNode)bindInlineEditor(titleNode);
};

const extractCategory=row=>{
  const meta=row.querySelector(':scope > .meta');if(!(meta instanceof HTMLElement))return '未分類';
  const text=String(meta.textContent||'').trim();
  if(!text||text.startsWith('担当 ')||text==='商品ページ')return '未分類';
  const first=text.split(' ・ ')[0].trim();return first&&first!=='商品ページ'&&!first.startsWith('担当 ')?first:'未分類';
};
const categoryKey=value=>String(value||'未分類').trim()||'未分類';
const groupExistingShopping=()=>{
  const section=page.querySelector('.shopping-checklist-section');if(!(section instanceof HTMLElement))return;
  const form=section.querySelector(':scope > .section-quick-entry');
  const rows=[...section.querySelectorAll('.linked-shopping-row')].filter(row=>row.closest('.expired-shopping')===null);
  if(!rows.length)return;
  const groups=new Map();
  for(const row of rows){
    const cat=categoryKey(extractCategory(row));
    let group=groups.get(cat);
    if(!group){group=document.createElement('div');group.className='shopping-category-group';group.dataset.category=cat;const head=document.createElement('div');head.className='shopping-category-title';head.textContent=cat;group.append(head);groups.set(cat,group);}
    group.append(row);
  }
  section.querySelectorAll(':scope > .shopping-group').forEach(node=>node.remove());
  const anchor=form||section.querySelector(':scope > .section-head');let cursor=anchor;
  for(const group of groups.values()){cursor?.insertAdjacentElement('afterend',group);cursor=group;}
};
const ensureShoppingGroup=category=>{
  const section=page.querySelector('.shopping-checklist-section');if(!(section instanceof HTMLElement))return null;
  const cat=categoryKey(category);let found=[...section.querySelectorAll(':scope > .shopping-category-group')].find(g=>g.dataset.category===cat);
  if(found)return found;
  const group=document.createElement('div');group.className='shopping-category-group';group.dataset.category=cat;const head=document.createElement('div');head.className='shopping-category-title';head.textContent=cat;group.append(head);section.append(group);return group;
};
const addShoppingRow=(id,name,category)=>{
  const section=page.querySelector('.shopping-checklist-section');if(!(section instanceof HTMLElement))return;
  clearEmpty(section);const group=ensureShoppingGroup(category);if(!group)return;
  const row=document.createElement('div');row.className='row linked-shopping-row reminders-new-row';
  row.innerHTML=`<div class="checklist-row-line"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${id}"><span></span></label><a class="checklist-row-action" href="/app/shopping_edit.php?id=${id}" aria-label="編集">編集</a></div><div class="meta"></div>`;
  const titleNode=row.querySelector('.shopping-check-row>span');if(titleNode)titleNode.textContent=name;const meta=row.querySelector('.meta');if(meta)meta.textContent=categoryKey(category)==='未分類'?'':categoryKey(category);
  group.append(row);if(titleNode)bindInlineEditor(titleNode);
};

const makeQuickForm=(section,type)=>{
  if(!(section instanceof HTMLElement)||section.querySelector(':scope > .section-quick-entry'))return;
  const form=document.createElement('form');form.className=`section-quick-entry section-quick-${type}`;form.dataset.type=type;
  const noun=type==='task'?'タスク':type==='shopping'?'買い物':'持ち物';
  form.innerHTML=`${type==='shopping'?'<div class="shopping-quick-category-row"><span class="shopping-quick-category-label">カテゴリ</span><input class="section-quick-input shopping-quick-category" type="text" maxlength="255" autocomplete="off" placeholder="自由入力"></div>':''}<div class="section-quick-row"><span class="section-quick-circle" aria-hidden="true"></span><input class="section-quick-input section-quick-name" type="text" maxlength="200" autocomplete="off" enterkeyhint="next" placeholder="新しい${noun}" aria-label="新しい${noun}"></div><div class="section-quick-status" role="status" aria-live="polite"></div>`;
  section.querySelector(':scope > .section-head')?.insertAdjacentElement('afterend',form);
  const name=form.querySelector('.section-quick-name'),category=form.querySelector('.shopping-quick-category'),status=form.querySelector('.section-quick-status');
  if(!(name instanceof HTMLInputElement))return;
  let saving=false;
  const submit=async()=>{
    const value=name.value.trim();if(!value||saving)return;saving=true;name.disabled=true;if(category instanceof HTMLInputElement)category.disabled=true;if(status)status.textContent='';
    try{
      let response;
      const isEvent=type==='task'&&section.dataset.kindTab==='event';
      let calendarColor='';try{calendarColor=localStorage.getItem('familytodo:lastCalendarColor')||'';}catch{}
      if(!/^#[0-9a-f]{6}$/i.test(calendarColor))calendarColor='';
      if(type==='task')response=await fetch('/api/task',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),title:value,dateOnly:selectedDate,endDateOnly:selectedDate,is_event:isEvent,calendar_color:calendarColor||undefined,noDate:false,allDay:true,calendar_visible:true})});
      else if(type==='shopping')response=await fetch('/api/shopping',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),action:'add',name:value,quantity:'1',category:category instanceof HTMLInputElement?category.value.trim():'',due_date:selectedDate})});
      else response=await fetch('/api/item',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),name:value,date:selectedDate})});
      const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
      if(!response.ok||!data.ok)throw new Error(data.error||'保存に失敗しました。');
      const id=Number(data.id||0);if(!id)throw new Error('保存結果を確認できませんでした。');
      if(type==='task'&&isEvent){location.reload();return;}
      if(type==='task')addTaskRow(id,value);else if(type==='shopping')addShoppingRow(id,value,category instanceof HTMLInputElement?category.value.trim():'');else addItemRow(id,value);
      name.value='';
    }catch(error){if(status)status.textContent=error?.message||String(error)||'保存に失敗しました。';}
    finally{saving=false;name.disabled=false;if(category instanceof HTMLInputElement)category.disabled=false;requestAnimationFrame(()=>name.focus({preventScroll:true}));}
  };
  name.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();void submit();}},true);
  if(category instanceof HTMLInputElement)category.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();name.focus();}},true);
  form.addEventListener('submit',event=>{event.preventDefault();void submit();});
};

makeQuickForm(page.querySelector('.task-section'),'task');
makeQuickForm(page.querySelector('.shopping-checklist-section'),'shopping');
makeQuickForm(page.querySelector('.item-section'),'item');
groupExistingShopping();
})();
