(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;
page.classList.add('reminders-ui');

const q=(selector,root=page)=>root.querySelector(selector);
const qa=(selector,root=page)=>[...root.querySelectorAll(selector)];
const count=(selector,root=page)=>qa(selector,root).length;

const dailyHead=q('.daily-head');
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
  dailyHead.insertAdjacentElement('afterend',grid);
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
  fab.innerHTML='<span class="reminders-plus" aria-hidden="true">＋</span><span>新規リマインダー</span>';
  fab.setAttribute('aria-label','新規リマインダーを追加');
  fab.title='新規リマインダーを追加';
}
})();
