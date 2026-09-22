(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;

const style=document.createElement('style');
style.textContent=`
.shopping-continuous-circle{border-style:dashed!important}
.shopping-continuous-composer:focus-within .shopping-continuous-circle{border-style:dashed!important;border-width:1.7px!important}
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

page.addEventListener('keydown',event=>{
  const input=event.target;
  if(!(input instanceof HTMLTextAreaElement)||!input.classList.contains('shopping-continuous-name'))return;
  if(event.isComposing||event.keyCode===229||event.key!=='Enter'||!input.value.trim())return;
  const form=input.closest('.shopping-continuous-composer');
  if(form instanceof HTMLElement)form.dataset.nextRow='1';
},true);

// Category counts/status/lifecycle are owned by goods-category-controller.js.
})();
