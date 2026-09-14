(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;

const style=document.createElement('style');
style.id='checklistAddFooterStyle';
style.textContent=`
.section-add-disclosure{margin:8px 0 0;border-top:1px solid #e5e7eb;background:#fff}
.section-add-disclosure>summary{list-style:none;display:flex;align-items:center;min-height:48px;padding:0 18px;color:#007aff;font-size:16px;font-weight:700;cursor:pointer;user-select:none;-webkit-user-select:none}
.section-add-disclosure>summary::-webkit-details-marker{display:none}
.section-add-disclosure>summary::before{content:'＋';font-size:22px;line-height:1;margin-right:6px;font-weight:500}
.section-add-disclosure[open]>summary{border-bottom:1px solid #eef0f3}
.section-add-disclosure .section-quick-entry{margin:0;border:0;padding:6px 0 10px}
.section-add-disclosure .section-quick-row{padding-left:26px!important;padding-right:18px!important}
.section-add-disclosure .shopping-quick-category-row{padding-left:58px!important;padding-right:18px!important}
.section-add-disclosure .section-quick-status{padding-left:58px!important}
`;
document.head.appendChild(style);

const labels=new Map([
  ['task-section','タスクを追加'],
  ['shopping-checklist-section','買い物を追加'],
  ['item-section','持ち物を追加'],
]);

const install=()=>{
  for(const [klass,label] of labels){
    const section=page.querySelector(`.${klass}`);
    if(!(section instanceof HTMLElement))continue;
    const form=section.querySelector(':scope > .section-quick-entry, :scope > .section-add-disclosure .section-quick-entry');
    if(!(form instanceof HTMLFormElement))continue;
    let details=section.querySelector(':scope > .section-add-disclosure');
    if(!(details instanceof HTMLDetailsElement)){
      details=document.createElement('details');
      details.className='section-add-disclosure';
      const summary=document.createElement('summary');
      summary.textContent=label;
      details.appendChild(summary);
    }
    if(form.parentElement!==details)details.appendChild(form);
    if(section.lastElementChild!==details)section.appendChild(details);
  }
};

install();
let queued=false;
new MutationObserver(()=>{
  if(queued)return;queued=true;
  queueMicrotask(()=>{queued=false;install();});
}).observe(page,{childList:true,subtree:true});
})();
