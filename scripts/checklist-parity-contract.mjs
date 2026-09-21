import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync('public/assets/'+p,'utf8');
const source=read('checklist-reminders-flow-fix.js');
const make=source.slice(source.indexOf('const makeQuickForm='),source.indexOf("makeQuickForm(page.querySelector"));
class Element{constructor(){this.dataset={};this.listeners={};}addEventListener(k,f){this.listeners[k]=f;}focus(){}querySelector(){return null;}}
class Input extends Element{constructor(){super();this.value='予定';}}
class Form extends Element{constructor(){super();this.input=new Input();this.status=new Element();}querySelector(s){return s==='.section-quick-name'?this.input:s==='.section-quick-status'?this.status:null;}}
for(const kind of ['task','event'])for(const failure of [false,true]){
 let form,body,reloaded=false;
 const section=new Element();section.dataset.kindTab=kind;section.querySelector=s=>s.includes('section-head')?{insertAdjacentElement(){}}:null;
 const ctx={HTMLElement:Element,HTMLInputElement:Input,HTMLFormElement:Form,document:{createElement(){return form=new Form();}},payload:{csrf:'test'},selectedDate:'2026-09-19',localStorage:{getItem(){return '#12ab34'}},fetch:async(u,o)=>{body=JSON.parse(o.body);if(failure)throw Error('network');return {ok:true,json:async()=>({ok:true,id:7})};},location:{reload(){reloaded=true;}},requestAnimationFrame:f=>f(),addTaskRow(){},addShoppingRow(){},addItemRow(){},section};
 vm.runInNewContext(make+';makeQuickForm(section,"task");',ctx);
 form.input.listeners.keydown({key:'Enter',preventDefault(){},stopImmediatePropagation(){}});
 await new Promise(r=>setImmediate(r));
 assert.equal(body.is_event,kind==='event');assert.equal(body.dateOnly,'2026-09-19');assert.equal(body.calendar_color,'#12ab34');assert.equal(form.input.disabled,false);
 assert.equal(reloaded,!failure&&kind==='event');if(failure)assert.equal(form.input.value,'予定');
}
const flow=read('checklist-reminders-flow-fix.js');
assert(flow.includes('const titleSelector='));
assert(!flow.includes('reminders-smart-card'));
assert(!flow.includes("querySelector('.reminders-quick-entry')"));
const ui=read('checklist-hierarchy-followup.js');
assert(ui.includes('if(liveAdd instanceof HTMLElement)'));
// Goods tabs choose the input target, deliberately do not filter category visibility.
const goodsApply=ui.slice(ui.indexOf("let active='shopping'"),ui.indexOf("apply('shopping');"));
assert(!goodsApply.includes('checklist-kind-hidden'));
for(const p of ['checklist-category-drag.js','checklist-category-followup.js'])assert(read(p).includes('.shopping-category-group:not(.belongings-category-group)'));
const categoryFollowup=read('checklist-category-followup.js');
assert(categoryFollowup.includes("button.dataset.categoryAddBound!=='1'"));
assert(categoryFollowup.includes("button.addEventListener('click',()=>activateComposer(group,button))"));
const categoryDrag=read('checklist-category-drag.js');
const itemPolish=read('checklist-item-polish.js');
const belongingsCategoryUi=read('checklist-belongings-categories.js');
assert(categoryDrag.includes("const bottomAnchor=section.querySelector(':scope > .zero-category-cluster,:scope > .zero-unclassified-add')"));
assert(belongingsCategoryUi.includes("const anchor=host.querySelector(':scope>.zero-category-cluster,:scope>.zero-unclassified-add')"));
assert(belongingsCategoryUi.includes("edit.textContent='i'"));
assert(categoryDrag.includes("closest('.belongings-category-group')"));
assert(categoryDrag.includes("action:'update_category',id,category:name===U?'':name"));
assert(itemPolish.includes('.shopping-checklist-section .item-grip{display:inline-flex!important}'));
assert(itemPolish.includes('same-category-sort-target'));
const belongingsCategories=read('checklist-belongings-categories.js');
// Shopping category creation stays on the pre-#1072 contenteditable flow that passed iPhone acceptance.
assert(!categoryDrag.includes('window.familytodoShoppingCategoryAdd=addCategoryDraft'));
assert(categoryDrag.includes('shopping-category-name" contenteditable="true"'));
assert(categoryDrag.includes("n.addEventListener('blur',()=>{if(String(n.textContent||'').trim())void commitDraft(g,n)})"));
// Belongings deliberately mirrors that interaction while retaining its own /api/item category_add ownership.
assert(belongingsCategories.includes('belongings-category-draft'));
assert(belongingsCategories.includes('shopping-category-name" contenteditable="true"'));
assert(belongingsCategories.includes("action:'category_add'"));
assert(belongingsCategories.includes("kind:'item'"));
assert(ui.includes("document.addEventListener('familytodo:category-created',syncCreated)"));
// Shopping-empty OR Belongings-empty is represented by one shared block on both tabs.
assert(ui.includes('const zeroClusters=[shoppingZero,itemZero].filter'));
assert(ui.includes("unifiedZero.classList.add('unified-goods-zero')"));
assert(ui.includes("shopping.append(unifiedZero)"));
assert(ui.includes("zero-category-cluster.unified-goods-zero"));
assert(!ui.includes('unified-item-zero'));
const sets=read('checklist-shopping-reusable-sets.js');
for(const contract of ['selection.querySelectorAll(\'input:checked\')','source_item_ids:source',"action:'reusable_set_invoke'","action:'reusable_set_delete'",'client_request_id:rid','この日に配置'])assert(sets.includes(contract),contract);
assert(!read('checklist-belongings-categories.js').includes("prompt('新しいカテゴリ名')"));
console.log('checklist parity: task/event payload, date/color, failure recovery, co-visible goods, canonical category add/reflection, unified empty-category OR surface, separate controllers, selected set lifecycle passed');
