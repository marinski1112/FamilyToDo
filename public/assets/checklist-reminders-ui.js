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
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw||''))?String(raw):new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
})();

const dailyHead=q('.daily-head');
if(dailyHead&&!q('.reminders-quick-entry')){
  const form=document.createElement('form');
  form.className='reminders-quick-entry';
  form.setAttribute('aria-label','チェックリストを追加');
  form.innerHTML=`<div class="reminders-quick-entry-row"><span class="reminders-empty-check" aria-hidden="true"></span><input class="reminders-quick-input" type="text" maxlength="200" autocomplete="off" enterkeyhint="done" placeholder="新しいリマインダー" aria-label="新しいリマインダー"><button class="reminders-save-button" type="submit" disabled>保存</button></div><div class="reminders-quick-status" role="status" aria-live="polite"></div>`;
  dailyHead.insertAdjacentElement('afterend',form);
  const input=form.querySelector('.reminders-quick-input');
  const save=form.querySelector('.reminders-save-button');
  const status=form.querySelector('.reminders-quick-status');
  if(input instanceof HTMLInputElement&&save instanceof HTMLButtonElement&&status instanceof HTMLElement){
    const sync=()=>{save.disabled=!input.value.trim()||form.dataset.saving==='1';};
    input.addEventListener('input',sync);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const title=input.value.trim();
      if(!title||form.dataset.saving==='1')return;
      form.dataset.saving='1';sync();status.textContent='保存中…';
      try{
        const response=await fetch('/api/task',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json','accept':'application/json'},
          body:JSON.stringify({
            csrf:String(payload.csrf||''),title,dateOnly:selectedDate,endDateOnly:selectedDate,
            is_event:false,noDate:false,allDay:true,calendar_visible:true,
          }),
        });
        const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
        if(!response.ok||!data.ok)throw new Error(data.error||'保存に失敗しました。');
        input.value='';status.textContent='追加しました';sync();
        const next=new URL(location.href);next.searchParams.set('date',selectedDate);location.replace(next.toString());
      }catch(error){
        status.textContent=error?.message||String(error)||'保存に失敗しました。';
        form.dataset.saving='0';sync();input.focus();
      }
    });
    requestAnimationFrame(()=>input.focus({preventScroll:true}));
  }
}

if(dailyHead&&!q('.reminders-smart-grid')){
  const taskCount=count('.task-section .task-row');
  const shoppingCount=count('.shopping-checklist-section input.toggle[data-type="shopping"]');
  const unorganizedCount=count('.unorganized-section input.toggle[data-type="task"]');
  const overdueCount=count('.expired-tasks .expired-row')+count('.expired-shopping .linked-shopping-row');
  const cards=[
    {label:'この日',icon:'●',tone:'blue',value:taskCount,selector:'.task-section'},
    {label:'買い物',icon:'🛒',tone:'orange',value:shoppingCount,selector:'.shopping-checklist-section'},
    {label:'期限切れ',icon:'!',tone:'red',value:overdueCount,selector:'.expired-tasks, .expired-shopping'},
    {label:'未整理',icon:'≡',tone:'gray',value:unorganizedCount,selector:'.unorganized-section'},
  ];
  const grid=document.createElement('div');
  grid.className='reminders-smart-grid';
  for(const card of cards){
    const a=document.createElement('a');
    a.className='reminders-smart-card';a.dataset.tone=card.tone;a.href='#';
    a.innerHTML=`<span class="reminders-smart-icon" aria-hidden="true">${card.icon}</span><strong class="reminders-smart-count">${card.value}</strong><span class="reminders-smart-label">${card.label}</span>`;
    a.addEventListener('click',event=>{
      event.preventDefault();
      const target=q(card.selector);
      if(target){
        if(target instanceof HTMLDetailsElement)target.open=true;
        target.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
    grid.appendChild(a);
  }
  const entry=q('.reminders-quick-entry');
  (entry||dailyHead).insertAdjacentElement('afterend',grid);
  const heading=document.createElement('h2');heading.className='reminders-list-heading';heading.textContent='リスト';
  grid.insertAdjacentElement('afterend',heading);
}

const sectionIcons=new Map([
  ['task-section','✓'],['shopping-checklist-section','🛒'],['item-section','🎒'],['unorganized-section','≡'],
]);
for(const [klass,icon] of sectionIcons){
  const section=q(`.${klass}`);if(!section)continue;
  const title=q('.section-head h2',section);if(!title||title.querySelector('.reminders-section-icon'))continue;
  const clean=String(title.textContent||'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
  title.textContent='';
  const badge=document.createElement('span');badge.className='reminders-section-icon';badge.setAttribute('aria-hidden','true');badge.textContent=icon;
  title.append(badge,document.createTextNode(clean));
}

for(const link of qa('.checklist-row-action')){
  if(!(link instanceof HTMLAnchorElement))continue;
  link.title=link.getAttribute('aria-label')||String(link.textContent||'詳細');
}

const fab=document.querySelector('a.fab.calendar-fab[href*="/task/new.php"]');
if(fab instanceof HTMLAnchorElement){
  fab.classList.remove('fab','calendar-fab');
  fab.classList.add('reminders-add-button');
  fab.innerHTML='<span class="reminders-plus" aria-hidden="true">＋</span><span>詳細入力</span>';
  fab.setAttribute('aria-label','詳細を指定して追加');
  fab.title='担当・時間・繰り返しなどを指定して追加';
}
})();
