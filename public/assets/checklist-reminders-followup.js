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

const editableTitle=label=>label?.querySelector(':scope > span.reminders-inline-title,:scope > span');
const checklistLabelSelector='label.task-main,label.shopping-check-row,.item-section .row label,.expired-task-main';

// A label normally toggles its checkbox when any blank area is tapped. In the Reminders-style
// list only the checkbox itself is a completion target; title/spacing taps enter title editing.
page.addEventListener('click',event=>{
  const raw=event.target;
  if(!(raw instanceof Element))return;
  const label=raw.closest(checklistLabelSelector);
  if(!(label instanceof HTMLLabelElement)||!page.contains(label))return;
  if(raw.closest('input.toggle'))return;
  const title=editableTitle(label);
  if(!(title instanceof HTMLElement))return;
  event.preventDefault();event.stopPropagation();
  title.click();
},true);

const shoppingGroups=()=>[...page.querySelectorAll('.shopping-category-group')].filter(node=>node instanceof HTMLElement&&!node.classList.contains('shopping-category-draft'));
const refreshCategoryCount=group=>{
  const title=group.querySelector(':scope > .shopping-category-title');
  const toggle=title?.querySelector(':scope > .shopping-category-toggle');
  if(!(title instanceof HTMLElement)||!(toggle instanceof HTMLButtonElement))return;
  const pending=[...group.querySelectorAll(':scope > .linked-shopping-row input.toggle[data-type="shopping"]')].filter(input=>input instanceof HTMLInputElement&&!input.checked).length;
  let badge=title.querySelector('.shopping-category-pending-count');
  if(!(badge instanceof HTMLElement)){badge=document.createElement('span');badge.className='shopping-category-pending-count';badge.setAttribute('aria-label','未チェック件数');toggle.insertAdjacentElement('beforebegin',badge);}
  badge.textContent=String(pending);
  badge.hidden=pending===0;
  const category=String(group.dataset.category||'未分類');
  toggle.setAttribute('aria-label',`${category}を${group.classList.contains('category-collapsed')?'展開':'閉じる'}（未チェック${pending}件）`);
};
const refreshCounts=()=>shoppingGroups().forEach(refreshCategoryCount);
refreshCounts();

// Category composer already saves on Enter and keeps focus. Make the transition visibly behave
// as a fresh next row by clearing transient status immediately after a successful save.
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
  // New standalone shopping rows created by the category composer have no due date by design.
  // Once completed, remove them from the active list instead of leaving a completed no-date row.
  if(input.dataset.type==='shopping'&&input.checked){
    const row=input.closest('.linked-shopping-row');
    if(row instanceof HTMLElement&&row.classList.contains('reminders-new-row')){
      const started=performance.now();
      const settle=()=>{if(input.disabled&&performance.now()-started<12000){requestAnimationFrame(settle);return;}if(input.checked){row.remove();refreshCounts();}};
      requestAnimationFrame(settle);
    }
  }
},true);

new MutationObserver(()=>queueMicrotask(refreshCounts)).observe(page,{subtree:true,childList:true,attributes:true,attributeFilter:['checked','class']});
})();
