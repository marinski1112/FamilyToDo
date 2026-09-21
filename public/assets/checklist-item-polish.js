(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
const section=page?.querySelector('.shopping-checklist-section');
if(!(page instanceof HTMLElement)||!(section instanceof HTMLElement))return;
let payload={};
try{payload=JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}')}catch{}
const familyId=Number(payload.familyId||0);
const storageKey=`familytodo:shopping-row-order:${familyId||'local'}`;

const style=document.createElement('style');
style.textContent=`
.shopping-checklist-section .item-grip{display:inline-flex!important}
.belongings-item-info{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 42px;width:42px;height:42px;border-radius:50%;background:#f0f7ff;color:#007aff!important;text-decoration:none;font-size:21px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1}
.belongings-item-info:active{background:#dcecff}
.shopping-product-link{display:inline-flex;align-items:center;justify-content:center;flex:0 0 42px;width:42px;height:42px;border-radius:50%;background:#f0f7ff;color:#007aff;text-decoration:none;font-size:21px;font-weight:700;line-height:1}
.shopping-product-link:active{background:#dcecff}
.linked-shopping-row.same-category-sort-target{box-shadow:inset 0 2px 0 rgba(0,122,255,.45)}
@media(max-width:820px){
  .checklist-page.reminders-ui .task-section,
  .checklist-page.reminders-ui .shopping-checklist-section,
  .checklist-page.reminders-ui .item-section,
  .checklist-page.reminders-ui .unorganized-section{
    width:calc(100% + 24px)!important;
    max-width:none!important;
    margin-left:-12px!important;
    margin-right:-12px!important;
    border-left:0!important;
    border-right:0!important;
    border-radius:0!important;
  }
  .reminders-add-button{
    left:auto!important;
    right:16px!important;
    width:58px!important;
    min-width:58px!important;
    height:58px!important;
    min-height:58px!important;
    padding:0!important;
    border-radius:50%!important;
    justify-content:center!important;
    gap:0!important;
    background:#4f46e5!important;
    color:#fff!important;
    box-shadow:0 6px 18px rgba(79,70,229,.26)!important;
    backdrop-filter:none!important;
    -webkit-backdrop-filter:none!important;
  }
  .reminders-add-button>span:not(.reminders-plus){display:none!important}
  .reminders-add-button .reminders-plus{font-size:38px!important;font-weight:300!important;line-height:1!important}
}
`;
document.head.append(style);

const getGroups=()=>[...section.querySelectorAll(':scope > .shopping-category-group')].filter(g=>g instanceof HTMLElement);
const categoryOf=g=>String(g?.dataset?.category||'未分類').trim()||'未分類';
const rowId=row=>Number(row?.querySelector?.('input.toggle[data-type="shopping"]')?.dataset.id||0);
const rowsOf=g=>[...g.querySelectorAll(':scope > .linked-shopping-row')].filter(r=>r instanceof HTMLElement);

const readOrder=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}};
const saveOrder=()=>{
  const order={};
  for(const group of getGroups())order[categoryOf(group)]=rowsOf(group).map(rowId).filter(id=>id>0);
  try{localStorage.setItem(storageKey,JSON.stringify(order))}catch{}
};
const applyOrder=()=>{
  const order=readOrder();
  for(const group of getGroups()){
    const ids=Array.isArray(order[categoryOf(group)])?order[categoryOf(group)].map(Number):[];
    if(!ids.length)continue;
    const map=new Map(rowsOf(group).map(row=>[rowId(row),row]));
    for(const id of ids){const row=map.get(id);if(row){group.append(row);map.delete(id)}}
    for(const row of map.values())group.append(row);
  }
};

const moveProductLink=row=>{
  if(!(row instanceof HTMLElement))return;
  const line=row.querySelector(':scope > .checklist-row-line');
  const meta=row.querySelector(':scope > .meta');
  if(!(line instanceof HTMLElement)||!(meta instanceof HTMLElement))return;
  const link=[...meta.querySelectorAll('a[href]')].find(a=>String(a.textContent||'').trim()==='商品ページ');
  if(!(link instanceof HTMLAnchorElement))return;
  link.className='shopping-product-link';
  link.textContent='↗';
  link.setAttribute('aria-label','商品ページを開く');
  link.title='商品ページ';
  const info=line.querySelector('.checklist-row-action');
  if(info)line.insertBefore(link,info);else line.append(link);
  for(const node of [...meta.childNodes]){
    if(node.nodeType===Node.TEXT_NODE)node.textContent=String(node.textContent||'').replace(/^\s*[・·|]\s*|\s*[・·|]\s*$/g,'');
  }
  if(!meta.textContent?.trim()&&!meta.querySelector('a,button'))meta.remove();
};
const polish=()=>section.querySelectorAll('.linked-shopping-row').forEach(moveProductLink);

const hoveredRow=(x,y)=>{
  const element=document.elementFromPoint(x,y);
  return element?.closest?.('.linked-shopping-row');
};
const reorderDragged=(clientX,clientY)=>{
  const dragging=section.querySelector('.linked-shopping-row.dragging');
  if(!(dragging instanceof HTMLElement))return false;
  const group=dragging.closest('.shopping-category-group');
  if(!(group instanceof HTMLElement))return false;
  const target=hoveredRow(clientX,clientY);
  if(!(target instanceof HTMLElement)||target===dragging||target.closest('.shopping-category-group')!==group)return false;
  section.querySelectorAll('.same-category-sort-target').forEach(n=>n.classList.remove('same-category-sort-target'));
  const rect=target.getBoundingClientRect();
  if(clientY<rect.top+rect.height/2)target.before(dragging);else target.after(dragging);
  target.classList.add('same-category-sort-target');
  return true;
};
const clearTarget=()=>section.querySelectorAll('.same-category-sort-target').forEach(n=>n.classList.remove('same-category-sort-target'));

section.addEventListener('dragover',event=>{if(reorderDragged(event.clientX,event.clientY))event.preventDefault()},true);
section.addEventListener('drop',()=>{setTimeout(()=>{clearTarget();saveOrder()},0)},false);
section.addEventListener('dragend',()=>{clearTarget();saveOrder()},false);
section.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')reorderDragged(event.clientX,event.clientY)},true);
section.addEventListener('pointerup',()=>{setTimeout(()=>{clearTarget();saveOrder()},0)},false);
section.addEventListener('pointercancel',clearTarget,false);

applyOrder();
polish();
new MutationObserver(()=>polish()).observe(section,{childList:true,subtree:true});
})();
