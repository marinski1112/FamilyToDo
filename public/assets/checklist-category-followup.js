(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
const section=page?.querySelector('.shopping-checklist-section');
if(!(page instanceof HTMLElement)||!(section instanceof HTMLElement))return;

const UNCLASSIFIED='未分類';
const style=document.createElement('style');
style.id='shoppingCategoryUxStyle';
style.textContent=`
.shopping-checklist-section .shopping-quick-category-row{display:none!important}
.shopping-category-title{min-height:50px!important;padding:8px 4px 8px 2px!important;border-bottom:1px solid #e5e7eb!important}
.shopping-category-name{font-size:18px!important;font-weight:800!important;line-height:1.3;color:#1f2937}
.shopping-category-toggle{transform:none!important;width:auto!important;min-width:44px!important;padding:0 6px!important;color:#8e8e93!important;font-size:12px!important;font-weight:700!important}
.shopping-category-group.category-collapsed>.shopping-category-title>.shopping-category-toggle{transform:none!important}
.shopping-category-group.category-collapsed>.shopping-category-footer{display:none!important}
.shopping-category-draft>.shopping-category-title>.shopping-category-toggle{display:none!important}
.shopping-category-footer{border-top:1px solid #eef0f3;padding:2px 8px 5px 42px;background:#fff}
.shopping-category-add-item{display:flex;align-items:center;min-height:44px;width:100%;border:0;background:transparent;color:#007aff;font:inherit;font-size:14px;font-weight:700;text-align:left;padding:0}
.shopping-category-footer .section-quick-entry{margin:0!important;border:0!important;padding:0 0 6px!important}
.shopping-category-footer .section-quick-row{padding:0!important}
.shopping-category-footer .section-quick-circle{border-radius:5px!important}
.shopping-category-footer .section-quick-status{padding-left:32px!important}
.shopping-category-form-parking{display:none!important}
.shopping-checklist-section input.check.toggle{-webkit-appearance:none;appearance:none;border-radius:5px!important}
@media(max-width:720px){.shopping-category-name{font-size:17px!important}.shopping-category-footer{padding-left:42px}}
`;
document.head.append(style);

const categoryOf=group=>String(group?.dataset?.category||UNCLASSIFIED).trim()||UNCLASSIFIED;
const rowsOf=group=>[...group.querySelectorAll(':scope > .linked-shopping-row')].filter(row=>row instanceof HTMLElement);
const rowCompleted=row=>row.querySelector('input.toggle[data-type="shopping"]')?.checked===true;
const groups=()=>[...section.querySelectorAll(':scope > .shopping-category-group')].filter(group=>group instanceof HTMLElement);

let quickForm=section.querySelector(':scope > .section-quick-entry');
const parking=document.createElement('div');
parking.className='shopping-category-form-parking';
parking.hidden=true;
section.append(parking);
if(quickForm instanceof HTMLFormElement){
  quickForm.classList.add('shopping-category-entry-form');
  quickForm.hidden=true;
  parking.append(quickForm);
}else quickForm=null;

const updateToggle=group=>{
  const toggle=group.querySelector(':scope > .shopping-category-title > .shopping-category-toggle');
  if(!(toggle instanceof HTMLButtonElement))return;
  const label=`${rowsOf(group).length}件`;
  if(toggle.textContent!==label)toggle.textContent=label;
  toggle.setAttribute('aria-label',group.classList.contains('category-collapsed')?'カテゴリを開く':'カテゴリを畳む');
};

const keepCompletedLast=group=>{
  const rows=rowsOf(group);
  if(rows.length<2){updateToggle(group);return;}
  const pending=rows.filter(row=>!rowCompleted(row));
  const completed=rows.filter(row=>rowCompleted(row));
  const desired=[...pending,...completed];
  if(rows.every((row,index)=>row===desired[index])){updateToggle(group);return;}
  const footer=group.querySelector(':scope > .shopping-category-footer');
  for(const row of desired)group.insertBefore(row,footer instanceof HTMLElement?footer:null);
  updateToggle(group);
};

const resetAddButtons=except=>{
  for(const button of section.querySelectorAll('.shopping-category-add-item')){
    if(button===except)continue;
    button.textContent='＋ このカテゴリに追加';
  }
};

const parkQuickForm=()=>{
  if(!(quickForm instanceof HTMLFormElement))return;
  quickForm.hidden=true;
  parking.append(quickForm);
  resetAddButtons(null);
};

const activateQuickForm=(group,button)=>{
  if(!(quickForm instanceof HTMLFormElement))return;
  const footer=group.querySelector(':scope > .shopping-category-footer');
  if(!(footer instanceof HTMLElement))return;
  if(quickForm.parentElement===footer&&!quickForm.hidden){parkQuickForm();return;}
  group.classList.remove('category-collapsed');
  resetAddButtons(button);
  const categoryInput=quickForm.querySelector('.shopping-quick-category');
  if(categoryInput instanceof HTMLInputElement)categoryInput.value=categoryOf(group)===UNCLASSIFIED?'':categoryOf(group);
  quickForm.hidden=false;
  footer.append(quickForm);
  button.textContent='閉じる';
  const name=quickForm.querySelector('.section-quick-name');
  if(name instanceof HTMLInputElement)requestAnimationFrame(()=>name.focus({preventScroll:true}));
  updateToggle(group);
};

const installFooter=group=>{
  if(group.classList.contains('shopping-category-draft'))return;
  let footer=group.querySelector(':scope > .shopping-category-footer');
  if(!(footer instanceof HTMLElement)){
    footer=document.createElement('div');
    footer.className='shopping-category-footer';
    const button=document.createElement('button');
    button.type='button';
    button.className='shopping-category-add-item';
    button.textContent='＋ このカテゴリに追加';
    button.addEventListener('click',()=>activateQuickForm(group,button));
    footer.append(button);
    group.append(footer);
  }
};

const decorateGroup=group=>{
  if(group.classList.contains('shopping-category-draft')){
    group.dataset.categoryUxDraft='1';
    return;
  }
  installFooter(group);
  if(group.dataset.categoryUxInit!=='1'){
    if(group.dataset.categoryUxDraft==='1')delete group.dataset.categoryUxDraft;
    else group.classList.add('category-collapsed');
    group.dataset.categoryUxInit='1';
  }
  keepCompletedLast(group);
};

const ensureUnclassifiedGroup=()=>{
  if(groups().length)return;
  const group=document.createElement('div');
  group.className='shopping-category-group';
  group.dataset.category=UNCLASSIFIED;
  const head=document.createElement('div');
  head.className='shopping-category-title';
  head.textContent=UNCLASSIFIED;
  const anchor=section.querySelector(':scope > .section-head');
  anchor?.insertAdjacentElement('afterend',group);
};

ensureUnclassifiedGroup();
groups().forEach(decorateGroup);

let queued=false;
const syncGroups=()=>{
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{
    queued=false;
    ensureUnclassifiedGroup();
    for(const group of groups())decorateGroup(group);
  });
};
new MutationObserver(syncGroups).observe(section,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-category']});

section.addEventListener('change',event=>{
  const checkbox=event.target;
  if(!(checkbox instanceof HTMLInputElement)||!checkbox.matches('input.toggle[data-type="shopping"]'))return;
  const started=performance.now();
  const settle=()=>{
    if(checkbox.disabled){if(performance.now()-started<12000)requestAnimationFrame(settle);return;}
    const group=checkbox.closest('.shopping-category-group');
    if(group instanceof HTMLElement)keepCompletedLast(group);
  };
  requestAnimationFrame(settle);
},true);
})();
