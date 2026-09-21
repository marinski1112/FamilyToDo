(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;

const style=document.createElement('style');
style.textContent=`
.shopping-continuous-circle{border-style:dashed!important}
.shopping-continuous-composer:focus-within .shopping-continuous-circle{border-style:dashed!important;border-width:1.7px!important}
.shopping-category-pending-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;margin-left:6px;padding:0 6px;border-radius:11px;background:#e5e7eb;color:#475569;font-size:12px;font-weight:800;box-sizing:border-box}
`;
document.head.append(style);

const editableTitle=label=>label?.querySelector(':scope > span.checklist-inline-title,:scope > span');
const checklistLabelSelector='label.task-main,label.shopping-check-row,.item-section .row label,.expired-task-main';
let forwardingTitleClick=false;

// Only the checkbox is a completion target. Forward blank label taps to the title once,
// while allowing a real title click through to the existing inline editor unchanged.
page.addEventListener('click',event=>{
  if(forwardingTitleClick)return;
  const raw=event.target;
  if(!(raw instanceof Element))return;
  const label=raw.closest(checklistLabelSelector);
  if(!(label instanceof HTMLLabelElement)||!page.contains(label))return;
  if(raw.closest('input.toggle'))return;
  const title=editableTitle(label);
  if(!(title instanceof HTMLElement))return;
  if(raw===title||title.contains(raw))return;
  event.preventDefault();event.stopPropagation();
  forwardingTitleClick=true;
  try{title.click();}finally{forwardingTitleClick=false;}
},true);

const shoppingGroups=()=>[...page.querySelectorAll('.shopping-category-group')].filter(node=>node instanceof HTMLElement&&!node.classList.contains('shopping-category-draft')&&!node.classList.contains('belongings-category-group'));
const refreshCategoryCount=group=>{
  const title=group.querySelector(':scope > .shopping-category-title');
  const toggle=title?.querySelector(':scope > .shopping-category-toggle');
  if(!(title instanceof HTMLElement)||!(toggle instanceof HTMLButtonElement))return;
  const pending=[...group.querySelectorAll(':scope > .linked-shopping-row input.toggle[data-type="shopping"]')].filter(input=>input instanceof HTMLInputElement&&!input.checked).length;
  let badge=title.querySelector('.shopping-category-pending-count');
  if(!(badge instanceof HTMLElement)){badge=document.createElement('span');badge.className='shopping-category-pending-count';badge.setAttribute('aria-label','未チェック件数');toggle.insertAdjacentElement('beforebegin',badge);}
  const next=String(pending);if(badge.textContent!==next)badge.textContent=next;
  const hidden=pending===0;if(badge.hidden!==hidden)badge.hidden=hidden;
  const category=String(group.dataset.category||'未分類');
  const aria=`${category}を${group.classList.contains('category-collapsed')?'展開':'閉じる'}（未チェック${pending}件）`;
  if(toggle.getAttribute('aria-label')!==aria)toggle.setAttribute('aria-label',aria);
};
const refreshCounts=()=>shoppingGroups().forEach(refreshCategoryCount);
refreshCounts();

page.addEventListener('keydown',event=>{
  const input=event.target;
  if(!(input instanceof HTMLTextAreaElement)||!input.classList.contains('shopping-continuous-name'))return;
  if(event.isComposing||event.keyCode===229||event.key!=='Enter'||!input.value.trim())return;
  const form=input.closest('.shopping-continuous-composer');
  if(form instanceof HTMLElement)form.dataset.nextRow='1';
},true);

page.addEventListener('change',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||!input.matches('input.toggle'))return;
  const group=input.closest('.shopping-category-group');
  if(group instanceof HTMLElement)queueMicrotask(()=>refreshCategoryCount(group));
},true);

page.addEventListener('familytodo:toggle-success',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.dataset.type!=='shopping'||!event.detail?.completed)return;
  const row=input.closest('.linked-shopping-row');
  if(row instanceof HTMLElement&&row.classList.contains('checklist-new-row')){row.remove();refreshCounts();}
});

// Refresh only when checklist rows/groups are structurally added or removed. Do not observe
// class/checked mutations: count rendering itself changes the DOM and previously fed the observer
// back into itself, starving taps while compositor scrolling still appeared responsive.
let refreshQueued=false;
new MutationObserver(records=>{
  if(!records.some(record=>record.addedNodes.length||record.removedNodes.length))return;
  if(refreshQueued)return;refreshQueued=true;
  requestAnimationFrame(()=>{refreshQueued=false;refreshCounts();});
}).observe(page,{subtree:true,childList:true});
})();