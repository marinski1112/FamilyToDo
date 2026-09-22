(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const style=document.createElement('style');style.textContent=`
.reminders-smart-grid,.reminders-list-heading{display:none!important}
.reminders-quick-entry-row{padding-left:26px!important}
.section-quick-entry .section-quick-row,.section-quick-item .section-quick-row{padding-left:26px!important;padding-right:14px!important}
.shopping-category-title{display:flex;align-items:center;gap:8px;min-height:40px;padding-right:8px}
.shopping-category-name{flex:1;min-width:0;cursor:text;overflow-wrap:anywhere}
.shopping-category-name[contenteditable=true]{outline:2px solid rgba(0,122,255,.25);background:#fff;border-radius:6px;padding:2px 4px}
.cat-grip,.item-grip{display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}
.cat-grip{width:30px;height:30px;flex:0 0 30px}.item-grip{width:28px;height:36px;flex:0 0 28px}
.shopping-category-group.drag-over{outline:2px solid rgba(0,122,255,.35);outline-offset:2px;border-radius:10px}
.shopping-category-group.dragging,.linked-shopping-row.dragging{opacity:.42}
.shopping-category-toggle{border:0;background:transparent;color:#8e8e93;font-size:18px;line-height:1;width:30px;height:30px;padding:0;transform:rotate(0deg);transition:transform .14s ease}
.shopping-category-group.category-collapsed>.shopping-category-toggle{transform:rotate(-90deg)}
.shopping-category-group.category-collapsed>.linked-shopping-row,.shopping-category-group.category-collapsed>.shopping-group,.shopping-category-group.category-collapsed>.shopping-group-head{display:none!important}
.shopping-category-add{margin-left:auto;border:0;background:transparent;color:#007aff;font:inherit;font-weight:700;padding:7px 2px;white-space:nowrap}
.shopping-category-draft{border:1px dashed #c7c7cc!important;border-radius:10px;background:#fff;min-height:52px}
.shopping-category-draft .shopping-category-name{color:#8e8e93}
.shopping-category-draft.drag-over{background:#f0f7ff}
.linked-shopping-row .shopping-check-row{touch-action:pan-y}
@media(max-width:720px){.shopping-checklist-section .section-head{align-items:center}.shopping-category-title{position:sticky;top:0;background:#fff;z-index:2}}
`;document.head.append(style);

// Gesture layer only: the controller validates kind and owns persistence.
let drag=null,start=null,timer=null;
const host=()=>document.querySelector('.unified-goods-section');
const group=node=>node?.closest?.('.unified-category-group[data-goods-kind]');
const clear=()=>{clearTimeout(timer);timer=null;start=null;document.querySelectorAll('.dragging,.drag-over').forEach(n=>n.classList.remove('dragging','drag-over'));drag=null;};
const begin=target=>{
 const g=group(target);if(!g)return null;
 const row=target.closest('.linked-shopping-row,.belongings-category-row');
 if(row)return {subject:row,group:g,type:'content'};
 if(g.dataset.category==='未分類')return null;
 return {subject:g,group:g,type:'category'};
};
const place=(target,y)=>{
 if(!drag||!target||target.dataset.goodsKind!==drag.group.dataset.goodsKind||target===drag.group)return;
 if(drag.type==='category'&&target.dataset.category!=='未分類'){
  const rect=target.getBoundingClientRect();if(y<rect.top+rect.height/2)target.before(drag.subject);else target.after(drag.subject);
 }else target.classList.add('drag-over');
};
const save=async(target)=>{
 const d=drag,controller=window.familytodoGoodsCategories;clear();if(!d||!controller)return;
 try{
  if(d.type==='content'){if(target)await controller.moveContent(d.subject,target);}
  else {const kind=d.group.dataset.goodsKind;const order=[...host().querySelectorAll(':scope>.unified-category-group')].filter(g=>g.dataset.goodsKind===kind&&g.dataset.category!=='未分類').map(g=>g.dataset.category);await controller.reorderCategories(kind,order);}
 }catch(error){alert(error.message||String(error));location.reload();}
};
document.addEventListener('dragstart',e=>{
 if(!e.target.closest('.goods-category-grip,.item-grip'))return;
 drag=begin(e.target);if(!drag)return;drag.subject.classList.add('dragging');e.dataTransfer?.setData('text/plain',drag.group.dataset.category);
});
document.addEventListener('dragover',e=>{if(!drag)return;const target=group(e.target);if(target&&target.dataset.goodsKind===drag.group.dataset.goodsKind){e.preventDefault();place(target,e.clientY);}});
document.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();void save(group(e.target));});
document.addEventListener('dragend',()=>{if(drag)clear();});
document.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse'||!e.target.closest('.goods-category-grip,.item-grip'))return;
 start={x:e.clientX,y:e.clientY,id:e.pointerId,target:e.target};
 timer=setTimeout(()=>{if(!start)return;drag=begin(start.target);if(drag)drag.subject.classList.add('dragging');},250);
});
document.addEventListener('pointermove',e=>{
 if(!start||start.id!==e.pointerId)return;
 if(!drag){if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>12){clearTimeout(timer);start=null;}return;}
 e.preventDefault();place(group(document.elementFromPoint(e.clientX,e.clientY)),e.clientY);
},{passive:false});
document.addEventListener('pointerup',e=>{if(!start||start.id!==e.pointerId)return;clearTimeout(timer);if(drag)void save(group(document.elementFromPoint(e.clientX,e.clientY)));else clear();});
document.addEventListener('pointercancel',clear);
document.addEventListener('keydown',e=>{
 if(!e.target.matches?.('.goods-category-grip')||!['ArrowUp','ArrowDown'].includes(e.key))return;
 const g=group(e.target),list=[...host().querySelectorAll(':scope>.unified-category-group')].filter(x=>!x.hidden&&x.dataset.goodsKind===g.dataset.goodsKind&&x.dataset.category!=='未分類'),i=list.indexOf(g),target=list[i+(e.key==='ArrowUp'?-1:1)];if(!target)return;e.preventDefault();drag=begin(e.target);if(e.key==='ArrowUp')target.before(g);else target.after(g);void save(target);e.target.focus();
});
const decorate=()=>{for(const row of host()?.querySelectorAll('.linked-shopping-row,.belongings-category-row')||[]){if(row.querySelector('.item-grip'))continue;const grip=document.createElement('span');grip.className='item-grip';grip.draggable=true;grip.textContent='☰';grip.setAttribute('aria-label','項目を別カテゴリへ移動');row.querySelector('label')?.before(grip);}};
document.addEventListener('familytodo:checklist-unified-ready',()=>{decorate();if(host())new MutationObserver(decorate).observe(host(),{childList:true,subtree:true});},{once:true});
})();
